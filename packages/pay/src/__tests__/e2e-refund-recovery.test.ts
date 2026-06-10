// e2e (path_kind: recovery): the refund / fulfilment-retraction lifecycle driven END-TO-END
// through the bridge — createIntent → 'captured' webhook (gate opens) → refund() initiates
// → 'refunded' webhook lands → gate retracts. This is the money-DOWN counterpart to the
// happy capture flow: it proves the bridge recovers a once-fulfillable intent to a
// non-fulfillable terminal state and that the descent never re-fires the start-service
// outbox. It also exercises webhook redelivery on the way down (a duplicate 'refunded' is a
// safe no-op), which the single lifecycle-integration test does not cover. The refund() call
// is record-only (webhook-authoritative): status must NOT change until the provider's refund
// webhook arrives.

import { describe, it, expect } from 'vitest'
import { createPaymentBridge } from '../core/bridge'
import { definePay } from '../core/config'
import type { PaymentSink, PaymentSinkEvent } from '../observability/index'
import type {
  ApplyTransitionInput,
  ApplyTransitionResult,
  NewPaymentIntent,
  OutboxMessage,
  PaymentIntent,
  PaymentProvider,
  VerifiedProviderEvent,
} from '../core/contract'

class FakeStore {
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
  refundCalls: { providerRef: string; amountMinor?: number; reason?: string }[] = []
  async createCheckoutSession() {
    return { providerRef: 'pi_stripe_1', clientSecret: 'pi_stripe_1_secret' }
  }
  async verifyWebhook() {
    return this.nextEvent
  }
  async refund(input: { providerRef: string; amountMinor?: number; reason?: string }) {
    this.refundCalls.push(input)
    return { refundRef: 're_1', amountMinor: input.amountMinor ?? 8400, status: 'pending' as const }
  }
  async getPayment() {
    return { providerRef: 'pi_stripe_1', status: 'succeeded', amountMinor: 8400, capturedAmountMinor: 8400 }
  }
}

class RecordingSink implements PaymentSink {
  emitted: PaymentSinkEvent[] = []
  emit(event: PaymentSinkEvent) {
    this.emitted.push(event)
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

describe('e2e — refund / fulfilment-retraction lifecycle through the bridge', () => {
  it('captured → refund() initiates → refunded webhook retracts the gate, no re-fire', async () => {
    const store = new FakeStore()
    const stripe = new FakeStripe()
    const sink = new RecordingSink()
    const bridge = createPaymentBridge({ config: CONFIG, providers: { stripe }, store, sink })

    // Drive to captured: gate is open, one start-service message emitted.
    const created = await bridge.createIntent({
      billableItem: { serviceRequestId: 'sr_refund', country: 'AE', amount: { amountMinor: 8400, currency: 'AED' } },
      idempotencyKey: 'sr_refund:formation',
    })
    const intentId = created.intentId
    stripe.nextEvent = evt('captured', 'evt_cap')
    const capRes = await bridge.confirmFromWebhook('raw-cap', 'sig-cap', 'stripe')
    expect(capRes.intent?.status).toBe('captured')
    expect(bridge.mayFulfil(capRes.intent!)).toBe(true)
    expect(store.outbox).toHaveLength(1)

    // refund() is record-only: provider is called, ledger gets refund_initiated, but the
    // intent status is UNCHANGED — the refund is not authoritative until its webhook lands.
    const init = await bridge.refund({ intentId, amountMinor: 8400, reason: 'customer_canceled' })
    expect(init.refundRef).toBe('re_1')
    expect(stripe.refundCalls).toEqual([
      { providerRef: 'pi_stripe_1', amountMinor: 8400, reason: 'customer_canceled' },
    ])
    {
      const intent = await bridge.status(intentId)
      expect(intent?.status).toBe('captured') // still fulfillable — refund only initiated
      expect(bridge.mayFulfil(intent!)).toBe(true)
    }

    // The provider's refund webhook is what actually retracts the verdict.
    stripe.nextEvent = evt('refunded', 'evt_refund', { amountMinor: 8400 })
    const refRes = await bridge.confirmFromWebhook('raw-ref', 'sig-ref', 'stripe')
    expect(refRes.applied).toBe(true)
    expect(refRes.intent?.status).toBe('refunded')
    expect(refRes.intent?.refundedAmountMinor).toBe(8400)
    expect(bridge.mayFulfil(refRes.intent!)).toBe(false) // gate retracted

    // A redelivered refund webhook (same providerEventId) is a safe no-op on the way down.
    stripe.nextEvent = evt('refunded', 'evt_refund', { amountMinor: 8400 })
    const dup = await bridge.confirmFromWebhook('raw-ref', 'sig-ref', 'stripe')
    expect(dup.handled).toBe(true)
    expect(dup.applied).toBe(false)

    // End-to-end ledger across the whole down-path, in order, with no duplicate refund row.
    expect(store.events.map((e) => e.event.type)).toEqual([
      'checkout_created',
      'captured',
      'refund_initiated',
      'refunded',
    ])
    // The start-service outbox fired exactly once (at capture) and NEVER again on the descent.
    expect(store.outbox).toHaveLength(1)

    // Observability stream reflects the full lifecycle the host audits.
    expect(sink.emitted.map((e) => e.type)).toEqual([
      'intent_created',
      'checkout_created',
      'captured',
      'refund_initiated',
      'refunded',
      'refunded', // the duplicate webhook still emits (applied:false in data)
    ])
  })
})
