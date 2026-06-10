// e2e (path_kind: happy): the full happy payment lifecycle driven END-TO-END through the
// bridge — createIntent → checkout (pending) → 'authorized' webhook → 'captured' webhook →
// fulfilment opens. Unlike the single lifecycle-integration test, this traverses ALL three
// control-plane surfaces of the bridge at once (createIntent + two distinct webhook
// deliveries + the mayFulfil verdict) AND asserts the observability sink stream the host
// sees, so it proves the whole money→fulfilment pipeline composes as one flow, not just that
// the pieces wire up. The gate must stay shut at 'authorized' (funds only held) and open
// exactly once at 'captured' (funds taken), emitting one start-service outbox message.

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
  async createCheckoutSession() {
    return { providerRef: 'pi_stripe_1', clientSecret: 'pi_stripe_1_secret' }
  }
  async verifyWebhook() {
    return this.nextEvent
  }
  async refund(input: { providerRef: string; amountMinor?: number }) {
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

describe('e2e — happy capture lifecycle through the bridge', () => {
  it('createIntent → authorize webhook → capture webhook opens fulfilment exactly once', async () => {
    const store = new FakeStore()
    const stripe = new FakeStripe()
    const sink = new RecordingSink()
    const bridge = createPaymentBridge({ config: CONFIG, providers: { stripe }, store, sink })

    // 1) Customer wants a service → intent created, checkout opened, intent is 'pending'.
    const created = await bridge.createIntent({
      billableItem: { serviceRequestId: 'sr_e2e', country: 'AE', amount: { amountMinor: 8400, currency: 'AED' } },
      idempotencyKey: 'sr_e2e:formation',
    })
    expect(created.status).toBe('pending')
    expect(created.clientSecret).toBe('pi_stripe_1_secret')
    {
      const intent = await bridge.status(created.intentId)
      expect(intent?.status).toBe('pending')
      expect(intent?.providerRef).toBe('pi_stripe_1')
      // Funds not yet held → service may NOT start.
      expect(bridge.mayFulfil(intent!)).toBe(false)
    }
    expect(store.outbox).toHaveLength(0)

    // 2) Authorization webhook → funds held, but a 'captured' policy keeps the gate SHUT.
    stripe.nextEvent = evt('authorized', 'evt_auth')
    const authRes = await bridge.confirmFromWebhook('raw-auth', 'sig-auth', 'stripe')
    expect(authRes.handled).toBe(true)
    expect(authRes.applied).toBe(true)
    expect(authRes.intent?.status).toBe('authorized')
    expect(bridge.mayFulfil(authRes.intent!)).toBe(false)
    expect(store.outbox).toHaveLength(0) // no start-service signal on hold

    // 3) Capture webhook → funds taken, gate opens, ONE start-service message emitted.
    stripe.nextEvent = evt('captured', 'evt_cap', { paymentMethod: 'card' })
    const capRes = await bridge.confirmFromWebhook('raw-cap', 'sig-cap', 'stripe')
    expect(capRes.intent?.status).toBe('captured')
    expect(capRes.intent?.capturedAmountMinor).toBe(8400)
    expect(bridge.mayFulfil(capRes.intent!)).toBe(true)
    expect(store.outbox).toHaveLength(1)
    expect(store.outbox[0]).toMatchObject({
      topic: 'payment.captured',
      serviceRequestId: 'sr_e2e',
      payload: { country: 'AE', entity: 'qarar-ae' },
    })

    // End-to-end ledger: created → checkout → authorized → captured, in order.
    expect(store.events.map((e) => e.event.type)).toEqual(['checkout_created', 'authorized', 'captured'])
    // The captured payment method is threaded all the way to the persisted transition.
    expect(store.events.find((e) => e.event.type === 'captured')?.paymentMethod).toBe('card')

    // The observability stream the host sees mirrors the whole flow.
    expect(sink.emitted.map((e) => e.type)).toEqual([
      'intent_created',
      'checkout_created',
      'authorized',
      'captured',
    ])
  })
})
