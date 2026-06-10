// integration (correctness / intra-system): a full webhook-driven lifecycle across the
// bridge + store + provider doubles — authorize → capture → refund — distinct from the
// existing bridge.test (single capture). Proves the components compose: ledger accrues in
// order, the start-service outbox fires once at capture, the refund webhook lands the
// 'refunded' status (refund() only initiates), and the fulfilment verdict is retracted.

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
  nextEvent: VerifiedProviderEvent | null = null
  refundCalls: { providerRef: string; amountMinor?: number }[] = []
  async createCheckoutSession() {
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
  countries: { AE: { entity: 'qarar-ae', currency: 'AED', provider: 'stripe:acct_ae', methods: ['card'] } },
  fulfilment: { startsOn: 'captured' },
})

const evt = (
  type: VerifiedProviderEvent['type'],
  id: string,
  extra: Partial<VerifiedProviderEvent> = {},
): VerifiedProviderEvent => ({
  providerEventId: id,
  type,
  providerRef: 'pi_stripe_1',
  amountMinor: 8400,
  raw: { id },
  ...extra,
})

describe('lifecycle integration — authorize → capture → refund', () => {
  let store: FakeStore
  let stripe: FakeStripe
  let bridge: PaymentBridge
  let intentId: string

  beforeEach(async () => {
    store = new FakeStore()
    stripe = new FakeStripe()
    bridge = createPaymentBridge({ config: CONFIG, providers: { stripe }, store })
    const created = await bridge.createIntent({
      billableItem: { serviceRequestId: 'sr_1', country: 'AE', amount: { amountMinor: 8400, currency: 'AED' } },
      idempotencyKey: 'sr_1:formation',
    })
    intentId = created.intentId
  })

  it('authorize holds funds but does NOT open the captured-policy gate', async () => {
    stripe.nextEvent = evt('authorized', 'evt_auth')
    const res = await bridge.confirmFromWebhook('raw', 'sig', 'stripe')
    expect(res.intent?.status).toBe('authorized')
    expect(bridge.mayFulfil(res.intent!)).toBe(false)
    expect(store.outbox).toHaveLength(0)
  })

  it('capture after authorize opens the gate exactly once and records the captured amount', async () => {
    stripe.nextEvent = evt('authorized', 'evt_auth')
    await bridge.confirmFromWebhook('raw', 'sig', 'stripe')
    stripe.nextEvent = evt('captured', 'evt_cap', { paymentMethod: 'card' })
    const res = await bridge.confirmFromWebhook('raw', 'sig', 'stripe')
    expect(res.intent?.status).toBe('captured')
    expect(res.intent?.capturedAmountMinor).toBe(8400)
    expect(bridge.mayFulfil(res.intent!)).toBe(true)
    expect(store.outbox).toHaveLength(1)
    expect(store.outbox[0]).toMatchObject({ topic: 'payment.captured', serviceRequestId: 'sr_1' })
  })

  it('refund() initiates only; the refund WEBHOOK lands refunded and retracts fulfilment', async () => {
    // Drive to captured first.
    stripe.nextEvent = evt('captured', 'evt_cap')
    await bridge.confirmFromWebhook('raw', 'sig', 'stripe')

    // 1) Initiation: provider called, status unchanged, ledger gets refund_initiated.
    const init = await bridge.refund({ intentId, amountMinor: 8400, reason: 'requested' })
    expect(init.refundRef).toBe('re_1')
    expect(stripe.refundCalls).toEqual([{ providerRef: 'pi_stripe_1', amountMinor: 8400, reason: 'requested' }])
    let intent = await bridge.status(intentId)
    expect(intent?.status).toBe('captured')
    expect(store.events.some((e) => e.event.type === 'refund_initiated')).toBe(true)

    // 2) The provider's refund webhook is what actually moves the state.
    stripe.nextEvent = evt('refunded', 'evt_refund', { amountMinor: 8400 })
    const res = await bridge.confirmFromWebhook('raw', 'sig', 'stripe')
    expect(res.applied).toBe(true)
    expect(res.intent?.status).toBe('refunded')
    expect(res.intent?.refundedAmountMinor).toBe(8400)
    expect(bridge.mayFulfil(res.intent!)).toBe(false) // verdict retracted

    // Ledger composed in order across all three components.
    expect(store.events.map((e) => e.event.type)).toEqual([
      'checkout_created',
      'captured',
      'refund_initiated',
      'refunded',
    ])
    // No second start-service signal on the way down.
    expect(store.outbox).toHaveLength(1)
  })
})
