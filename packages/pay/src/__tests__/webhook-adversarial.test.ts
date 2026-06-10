// adversarial (resilience / protocol-misuse): hostile webhook traffic. A forged event
// (signature fails → verifyWebhook returns null) must NOT move money; a replayed/duplicate
// captured event must NOT double-start fulfilment; a maliciously back-dated event that
// implies an illegal transition must be rejected, not silently coerced.

import { describe, it, expect, beforeEach } from 'vitest'
import { createPaymentBridge, type PaymentBridge } from '../core/bridge'
import { definePay } from '../core/config'
import { InvalidTransitionError } from '../core/machine'
import type {
  ApplyTransitionInput,
  ApplyTransitionResult,
  NewPaymentIntent,
  OutboxMessage,
  PaymentIntent,
  PaymentProvider,
  PaymentStore,
  VerifiedProviderEvent,
} from '../core/contract'

class FakeStore implements PaymentStore {
  intents = new Map<string, PaymentIntent>()
  events: ApplyTransitionInput[] = []
  outbox: OutboxMessage[] = []
  private appliedEventIds = new Set<string>()
  private seq = 0

  async findIntentByIdempotencyKey(key: string) {
    return [...this.intents.values()].find((i) => i.idempotencyKey === key) ?? null
  }
  async insertIntent(input: NewPaymentIntent): Promise<PaymentIntent> {
    const id = `pi_local_${++this.seq}`
    const intent: PaymentIntent = {
      id,
      serviceRequestId: input.serviceRequestId,
      country: input.country,
      entity: input.entity,
      status: input.status,
      amount: input.amount,
      capturedAmountMinor: 0,
      refundedAmountMinor: 0,
      providerId: input.providerId,
      idempotencyKey: input.idempotencyKey,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    this.intents.set(id, intent)
    return intent
  }
  async setProviderRef(intentId: string, providerRef: string) {
    const i = this.intents.get(intentId)
    if (i) i.providerRef = providerRef
  }
  async getIntent(intentId: string) {
    return this.intents.get(intentId) ?? null
  }
  async getIntentByProviderRef(providerRef: string) {
    return [...this.intents.values()].find((i) => i.providerRef === providerRef) ?? null
  }
  async applyTransition(input: ApplyTransitionInput): Promise<ApplyTransitionResult> {
    const intent = this.intents.get(input.intentId)!
    if (this.appliedEventIds.has(input.providerEventId)) {
      return { intent, applied: false }
    }
    this.appliedEventIds.add(input.providerEventId)
    this.events.push(input)
    intent.status = input.nextStatus
    if (input.providerRef) intent.providerRef = input.providerRef
    if (input.capturedAmountMinor != null) intent.capturedAmountMinor = input.capturedAmountMinor
    if (input.refundedAmountMinor != null) intent.refundedAmountMinor = input.refundedAmountMinor
    if (input.outbox) this.outbox.push(input.outbox)
    return { intent, applied: true }
  }
}

// A provider whose verifyWebhook rejects forged signatures (returns null) but accepts a
// pre-armed "verified" event for the valid-signature path — modelling a real adapter.
class FakeStripe implements PaymentProvider {
  id = 'stripe'
  nextEvent: VerifiedProviderEvent | null = null
  async createCheckoutSession() {
    return { providerRef: 'pi_stripe_1', clientSecret: 'pi_stripe_1_secret' }
  }
  async verifyWebhook({ signature }: { raw: string | Uint8Array; signature: string }) {
    // Forged/garbage signature → unverifiable → null (the adapter's job).
    if (signature !== 'good-sig') return null
    return this.nextEvent
  }
  async refund(input: { providerRef: string; amountMinor?: number }) {
    return { refundRef: 're_1', amountMinor: input.amountMinor ?? 8400, status: 'pending' as const }
  }
  async getPayment() {
    return { providerRef: 'pi_stripe_1', status: 'succeeded', amountMinor: 8400, capturedAmountMinor: 8400 }
  }
}

const CONFIG = definePay({
  countries: {
    AE: { entity: 'qarar-ae', currency: 'AED', provider: 'stripe:acct_ae', methods: ['card', 'apple_pay'] },
  },
  fulfilment: { startsOn: 'captured' },
})

const captured: VerifiedProviderEvent = {
  providerEventId: 'evt_capture_1',
  type: 'captured',
  providerRef: 'pi_stripe_1',
  amountMinor: 8400,
  paymentMethod: 'card',
  raw: { id: 'evt_capture_1' },
}

describe('webhook adversarial — forgery / replay / protocol misuse', () => {
  let store: FakeStore
  let stripe: FakeStripe
  let bridge: PaymentBridge

  beforeEach(async () => {
    store = new FakeStore()
    stripe = new FakeStripe()
    bridge = createPaymentBridge({ config: CONFIG, providers: { stripe }, store })
    await bridge.createIntent({
      billableItem: { serviceRequestId: 'sr_1', country: 'AE', amount: { amountMinor: 8400, currency: 'AED' } },
      idempotencyKey: 'sr_1',
    })
  })

  it('a FORGED captured event (bad signature) does not move money or start fulfilment', async () => {
    stripe.nextEvent = captured // attacker knows the shape, but the signature is wrong
    const res = await bridge.confirmFromWebhook('{"type":"captured"}', 'forged', 'stripe')
    expect(res.handled).toBe(false)
    expect(res.applied).toBe(false)
    expect(store.outbox).toHaveLength(0)
    const intent = await store.getIntentByProviderRef('pi_stripe_1')
    expect(intent?.status).toBe('pending') // never advanced
  })

  it('a REPLAYED captured event (same providerEventId) is an idempotent no-op — no double-start', async () => {
    stripe.nextEvent = captured
    const first = await bridge.confirmFromWebhook('raw', 'good-sig', 'stripe')
    expect(first.applied).toBe(true)
    // Attacker re-POSTs the exact same verified event many times.
    for (let i = 0; i < 5; i++) {
      const replay = await bridge.confirmFromWebhook('raw', 'good-sig', 'stripe')
      expect(replay.handled).toBe(true)
      expect(replay.applied).toBe(false)
    }
    expect(store.outbox).toHaveLength(1) // fulfilment fired exactly once
    const captures = store.events.filter((e) => e.event.type === 'captured')
    expect(captures).toHaveLength(1)
  })

  it('a back-dated event implying an illegal transition is rejected (cannot re-pend a captured intent)', async () => {
    stripe.nextEvent = captured
    await bridge.confirmFromWebhook('raw', 'good-sig', 'stripe') // now captured
    // Attacker forges an "expired" event for an already-captured intent (captured→expired
    // is not a legal edge). The machine must throw rather than corrupt the state.
    stripe.nextEvent = {
      providerEventId: 'evt_expire_replay',
      type: 'expired',
      providerRef: 'pi_stripe_1',
      raw: {},
    }
    await expect(bridge.confirmFromWebhook('raw', 'good-sig', 'stripe')).rejects.toThrow(InvalidTransitionError)
    const intent = await store.getIntentByProviderRef('pi_stripe_1')
    expect(intent?.status).toBe('captured') // unchanged
  })
})
