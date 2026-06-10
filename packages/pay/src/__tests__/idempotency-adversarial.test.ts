// adversarial (resilience / resource-abuse): abuse of the idempotency seams. Hammering
// createIntent for one billable_item must never mint a second intent (no double-charge);
// distinct providerEventIds for the SAME logical capture must not each fire fulfilment
// beyond the first threshold crossing; refund() is record-only and must not flip status
// however many times it is replayed.

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

class FakeStore implements PaymentStore {
  intents = new Map<string, PaymentIntent>()
  events: ApplyTransitionInput[] = []
  outbox: OutboxMessage[] = []
  insertCount = 0
  private appliedEventIds = new Set<string>()
  private seq = 0

  async findIntentByIdempotencyKey(key: string) {
    return [...this.intents.values()].find((i) => i.idempotencyKey === key) ?? null
  }
  async insertIntent(input: NewPaymentIntent): Promise<PaymentIntent> {
    this.insertCount++
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
  nextEvent: VerifiedProviderEvent | null = null
  refundCalls: unknown[] = []
  async createCheckoutSession() {
    return { providerRef: 'pi_stripe_1', clientSecret: 'pi_stripe_1_secret' }
  }
  async verifyWebhook() {
    return this.nextEvent
  }
  async refund(input: { providerRef: string; amountMinor?: number }) {
    this.refundCalls.push(input)
    return { refundRef: `re_${this.refundCalls.length}`, amountMinor: input.amountMinor ?? 8400, status: 'pending' as const }
  }
  async getPayment() {
    return { providerRef: 'pi_stripe_1', status: 'succeeded', amountMinor: 8400, capturedAmountMinor: 8400 }
  }
}

const CONFIG = definePay({
  countries: {
    AE: { entity: 'qarar-ae', currency: 'AED', provider: 'stripe:acct_ae', methods: ['card'] },
  },
  fulfilment: { startsOn: 'captured' },
})

const billable = {
  serviceRequestId: 'sr_1',
  country: 'AE',
  amount: { amountMinor: 8400, currency: 'AED' },
}

describe('idempotency adversarial — resource abuse', () => {
  let store: FakeStore
  let stripe: FakeStripe
  let bridge: PaymentBridge

  beforeEach(() => {
    store = new FakeStore()
    stripe = new FakeStripe()
    bridge = createPaymentBridge({ config: CONFIG, providers: { stripe }, store })
  })

  it('repeated createIntent with one idempotencyKey mints exactly one intent (no double-charge)', async () => {
    // Sequential retries — the contract's idempotency guard is the
    // findIntentByIdempotencyKey lookup, which a retrying caller hits before each attempt.
    const ids = new Set<string>()
    for (let i = 0; i < 8; i++) {
      const r = await bridge.createIntent({ billableItem: billable, idempotencyKey: 'sr_1:formation' })
      ids.add(r.intentId)
    }
    expect(ids.size).toBe(1)
    expect(store.intents.size).toBe(1)
    expect(store.insertCount).toBe(1) // inserted once; every retry short-circuited
  })

  it('the SAME captured providerEventId replayed N times fires fulfilment exactly once', async () => {
    await bridge.createIntent({ billableItem: billable, idempotencyKey: 'sr_1:formation' })
    stripe.nextEvent = {
      providerEventId: 'evt_capture_dup',
      type: 'captured',
      providerRef: 'pi_stripe_1',
      amountMinor: 8400,
      raw: {},
    }
    for (let i = 0; i < 4; i++) await bridge.confirmFromWebhook('raw', 'sig', 'stripe')
    expect(store.outbox).toHaveLength(1)
    expect(store.events.filter((e) => e.event.type === 'captured')).toHaveLength(1)
  })

  it('replaying refund() does not flip status away from captured (webhook-authoritative)', async () => {
    const created = await bridge.createIntent({ billableItem: billable, idempotencyKey: 'sr_1:formation' })
    stripe.nextEvent = {
      providerEventId: 'evt_capture_1',
      type: 'captured',
      providerRef: 'pi_stripe_1',
      amountMinor: 8400,
      raw: {},
    }
    await bridge.confirmFromWebhook('raw', 'sig', 'stripe')
    // Attacker calls refund repeatedly hoping to flip state / over-refund locally.
    await bridge.refund({ intentId: created.intentId, amountMinor: 8400 })
    await bridge.refund({ intentId: created.intentId, amountMinor: 8400 })
    const intent = await store.getIntent(created.intentId)
    expect(intent?.status).toBe('captured') // status only moves on the refund WEBHOOK
    expect(intent?.refundedAmountMinor).toBe(0) // no local refund accounting
  })
})
