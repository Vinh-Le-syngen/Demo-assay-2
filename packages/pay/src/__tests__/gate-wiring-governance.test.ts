// governance (compliance / authz-policy): the fulfilment GATE wiring through the bridge.
// The bridge.mayFulfil() verdict and the fulfilment outbox message are the only authority
// the rest of the platform should trust to start paid work. This proves the gate is wired
// to the CONFIGURED trigger and that the "start the service" outbox is emitted on the
// confirmed-capture crossing and ONLY then — the deny-before-payment authz boundary.

import { describe, it, expect, beforeEach } from 'vitest'
import { createPaymentBridge, type PaymentBridge } from '../core/bridge'
import { definePay, type PayConfig } from '../core/config'
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

const ev = (type: VerifiedProviderEvent['type'], id: string): VerifiedProviderEvent => ({
  providerEventId: id,
  type,
  providerRef: 'pi_stripe_1',
  amountMinor: 8400,
  raw: {},
})

function harness(cfg: PayConfig) {
  const store = new FakeStore()
  const stripe = new FakeStripe()
  const bridge: PaymentBridge = createPaymentBridge({ config: cfg, providers: { stripe }, store })
  return { store, stripe, bridge }
}

const billable = { serviceRequestId: 'sr_1', country: 'AE', amount: { amountMinor: 8400, currency: 'AED' } }

const captureCfg = definePay({
  countries: { AE: { entity: 'qarar-ae', currency: 'AED', provider: 'stripe:acct_ae', methods: ['card'] } },
  fulfilment: { startsOn: 'captured' },
})
const authorizeCfg = definePay({
  countries: { AE: { entity: 'qarar-ae', currency: 'AED', provider: 'stripe:acct_ae', methods: ['card'] } },
  fulfilment: { startsOn: 'authorized' },
})

describe('gate wiring — bridge.mayFulfil denies before payment (governance)', () => {
  let h: ReturnType<typeof harness>
  beforeEach(async () => {
    h = harness(captureCfg)
    await h.bridge.createIntent({ billableItem: billable, idempotencyKey: 'sr_1' })
  })

  it('a freshly-created (pending) intent may NOT fulfil and emits no start signal', async () => {
    const intent = await h.store.getIntentByProviderRef('pi_stripe_1')
    expect(h.bridge.mayFulfil(intent!)).toBe(false)
    expect(h.store.outbox).toHaveLength(0)
  })

  it('captured crosses the gate: mayFulfil flips true and the start-service outbox is emitted once', async () => {
    h.stripe.nextEvent = ev('captured', 'evt_cap')
    const res = await h.bridge.confirmFromWebhook('raw', 'sig', 'stripe')
    expect(h.bridge.mayFulfil(res.intent!)).toBe(true)
    expect(h.store.outbox).toHaveLength(1)
    expect(h.store.outbox[0]).toMatchObject({ topic: 'payment.captured', serviceRequestId: 'sr_1' })
  })

  it('under startsOn:captured an authorized-only intent is still gated shut', async () => {
    h.stripe.nextEvent = ev('authorized', 'evt_auth')
    const res = await h.bridge.confirmFromWebhook('raw', 'sig', 'stripe')
    expect(res.intent?.status).toBe('authorized')
    expect(h.bridge.mayFulfil(res.intent!)).toBe(false) // funds held ≠ funds taken
    expect(h.store.outbox).toHaveLength(0) // no start-service signal yet
  })
})

describe('gate wiring — trigger is read from config (governance)', () => {
  it('startsOn:authorized opens the gate at the hold, and capture does NOT re-fire it', async () => {
    const h = harness(authorizeCfg)
    await h.bridge.createIntent({ billableItem: billable, idempotencyKey: 'sr_1' })

    h.stripe.nextEvent = ev('authorized', 'evt_auth')
    const authed = await h.bridge.confirmFromWebhook('raw', 'sig', 'stripe')
    expect(h.bridge.mayFulfil(authed.intent!)).toBe(true)
    expect(h.store.outbox).toHaveLength(1) // fulfilment authorised at the hold

    h.stripe.nextEvent = ev('captured', 'evt_cap')
    await h.bridge.confirmFromWebhook('raw', 'sig', 'stripe')
    expect(h.store.outbox).toHaveLength(1) // edge already crossed — no duplicate start
  })
})
