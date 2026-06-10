// negative (resilience / input-validation): the bridge must reject bad inputs and
// unsupported/unrecognised payloads at its boundary — unknown providers, unknown
// countries, currency mismatch, malformed/unverifiable webhooks, refunds on nothing.

import { describe, it, expect, beforeEach } from 'vitest'
import { createPaymentBridge, type PaymentBridge } from '../core/bridge'
import { definePay } from '../core/config'
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

// ── In-memory fakes (same doubles the bridge test uses) ────────────────────────────

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

class FakeStripe implements PaymentProvider {
  id = 'stripe'
  lastCheckout?: unknown
  nextEvent: VerifiedProviderEvent | null = null
  refundCalls: unknown[] = []
  async createCheckoutSession(input: unknown) {
    this.lastCheckout = input
    return { providerRef: 'pi_stripe_1', clientSecret: 'pi_stripe_1_secret' }
  }
  async verifyWebhook() {
    return this.nextEvent
  }
  async refund(input: { providerRef: string; amountMinor?: number }) {
    this.refundCalls.push(input)
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

describe('bridge — bad inputs are rejected (negative)', () => {
  let store: FakeStore
  let stripe: FakeStripe
  let bridge: PaymentBridge

  beforeEach(() => {
    store = new FakeStore()
    stripe = new FakeStripe()
    bridge = createPaymentBridge({ config: CONFIG, providers: { stripe }, store })
  })

  it('rejects createIntent for an unconfigured country (no silent default)', async () => {
    await expect(
      bridge.createIntent({
        billableItem: { serviceRequestId: 'sr_x', country: 'ZZ', amount: { amountMinor: 100, currency: 'AED' } },
        idempotencyKey: 'sr_x',
      }),
    ).rejects.toThrow(/no payment config/)
  })

  it('rejects a currency that is not the entity currency (no FX in the path)', async () => {
    await expect(
      bridge.createIntent({
        billableItem: { serviceRequestId: 'sr_y', country: 'AE', amount: { amountMinor: 8400, currency: 'USD' } },
        idempotencyKey: 'sr_y',
      }),
    ).rejects.toThrow(/currency mismatch/)
    // The intent must NOT have been persisted on the rejected path.
    expect(store.intents.size).toBe(0)
  })

  it('a webhook for an unconfigured provider id is rejected (unsupported provider)', async () => {
    await expect(bridge.confirmFromWebhook('raw', 'sig', 'paypal')).rejects.toThrow(/no provider registered/)
  })

  it('an unverifiable (null) webhook is not handled and nothing is applied', async () => {
    stripe.nextEvent = null
    const res = await bridge.confirmFromWebhook('garbage', 'bad-sig', 'stripe')
    expect(res.handled).toBe(false)
    expect(res.applied).toBe(false)
    expect(res.reason).toBe('invalid_signature_or_unrecognized')
    expect(store.events).toHaveLength(0)
  })

  it('a verified webhook for an unknown providerRef is not handled', async () => {
    stripe.nextEvent = {
      providerEventId: 'evt_orphan',
      type: 'captured',
      providerRef: 'pi_never_seen',
      amountMinor: 8400,
      raw: {},
    }
    const res = await bridge.confirmFromWebhook('raw', 'sig', 'stripe')
    expect(res.handled).toBe(false)
    expect(res.reason).toBe('unknown_provider_ref')
  })

  it('refund on an unknown intent id throws (cannot refund nothing)', async () => {
    await expect(bridge.refund({ intentId: 'pi_missing' })).rejects.toThrow(/unknown intent/)
  })
})
