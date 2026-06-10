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

// ── In-memory fakes ───────────────────────────────────────────────────────────────

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
    // Idempotent on providerEventId — a duplicate is a no-op.
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
    AE: { entity: 'qarar-ae', currency: 'AED', provider: 'stripe:acct_ae', methods: ['card', 'apple_pay', 'google_pay'] },
  },
  fulfilment: { startsOn: 'captured' },
})

const captureEvent: VerifiedProviderEvent = {
  providerEventId: 'evt_capture_1',
  type: 'captured',
  providerRef: 'pi_stripe_1',
  amountMinor: 8400,
  paymentMethod: 'apple_pay',
  raw: { id: 'evt_capture_1' },
}

describe('createPaymentBridge', () => {
  let store: FakeStore
  let stripe: FakeStripe
  let bridge: PaymentBridge

  beforeEach(() => {
    store = new FakeStore()
    stripe = new FakeStripe()
    bridge = createPaymentBridge({ config: CONFIG, providers: { stripe }, store })
  })

  const newIntent = () =>
    bridge.createIntent({
      billableItem: {
        serviceRequestId: 'sr_1',
        country: 'AE',
        amount: { amountMinor: 8400, currency: 'AED' },
      },
      idempotencyKey: 'sr_1:company_formation',
    })

  it('createIntent → pending + clientSecret, drives the provider with the entity account', async () => {
    const res = await newIntent()
    expect(res.status).toBe('pending')
    expect(res.clientSecret).toBe('pi_stripe_1_secret')
    expect((stripe.lastCheckout as { account: string }).account).toBe('acct_ae')
    const intent = await bridge.status(res.intentId)
    expect(intent?.providerRef).toBe('pi_stripe_1')
    expect(intent?.entity).toBe('qarar-ae')
  })

  it('createIntent is idempotent per idempotencyKey (no double intent)', async () => {
    const a = await newIntent()
    const b = await newIntent()
    expect(b.intentId).toBe(a.intentId)
    expect(store.intents.size).toBe(1)
  })

  it('rejects a currency that is not the entity currency (no FX in the path)', async () => {
    await expect(
      bridge.createIntent({
        billableItem: { serviceRequestId: 'sr_2', country: 'AE', amount: { amountMinor: 8400, currency: 'USD' } },
        idempotencyKey: 'sr_2',
      }),
    ).rejects.toThrow(/currency mismatch/)
  })

  it('confirmFromWebhook(captured) advances + emits the fulfilment outbox once', async () => {
    await newIntent()
    stripe.nextEvent = captureEvent
    const res = await bridge.confirmFromWebhook('raw', 'sig', 'stripe')
    expect(res.handled).toBe(true)
    expect(res.applied).toBe(true)
    expect(res.intent?.status).toBe('captured')
    expect(res.intent?.capturedAmountMinor).toBe(8400)
    expect(store.outbox).toHaveLength(1)
    expect(store.outbox[0]).toMatchObject({ topic: 'payment.captured', serviceRequestId: 'sr_1' })
    expect(bridge.mayFulfil(res.intent!)).toBe(true)
    // the captured method is threaded through to the store (→ intent.payment_method)
    expect(store.events.find((e) => e.event.type === 'captured')?.paymentMethod).toBe('apple_pay')
  })

  it('a duplicate captured webhook is a no-op (no double-start)', async () => {
    await newIntent()
    stripe.nextEvent = captureEvent
    await bridge.confirmFromWebhook('raw', 'sig', 'stripe')
    const dup = await bridge.confirmFromWebhook('raw', 'sig', 'stripe')
    expect(dup.handled).toBe(true)
    expect(dup.applied).toBe(false)
    expect(store.outbox).toHaveLength(1) // still one — service can't double-start
  })

  it('an invalid signature is not handled', async () => {
    await newIntent()
    stripe.nextEvent = null
    const res = await bridge.confirmFromWebhook('raw', 'bad-sig', 'stripe')
    expect(res.handled).toBe(false)
    expect(res.reason).toBe('invalid_signature_or_unrecognized')
  })

  it('an event for an unknown providerRef is not handled', async () => {
    stripe.nextEvent = { ...captureEvent, providerRef: 'pi_unknown' }
    const res = await bridge.confirmFromWebhook('raw', 'sig', 'stripe')
    expect(res.handled).toBe(false)
    expect(res.reason).toBe('unknown_provider_ref')
  })

  it('refund only records initiation (webhook-authoritative); status stays captured', async () => {
    const created = await newIntent()
    stripe.nextEvent = captureEvent
    await bridge.confirmFromWebhook('raw', 'sig', 'stripe')
    const res = await bridge.refund({ intentId: created.intentId, amountMinor: 8400, reason: 'requested' })
    expect(res.refundRef).toBe('re_1')
    expect(stripe.refundCalls).toHaveLength(1)
    const intent = await bridge.status(created.intentId)
    expect(intent?.status).toBe('captured') // unchanged until the refund webhook lands
    expect(store.events.some((e) => e.event.type === 'refund_initiated')).toBe(true)
  })
})
