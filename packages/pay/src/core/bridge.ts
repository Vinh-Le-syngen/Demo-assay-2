// @sys/pay — the bridge. Orchestration only (Control). Provider/store are injected; this
// file holds NO IO. Turns "customer wants a service" into "payment confirmed → fulfilment
// allowed", provider-agnostic and webhook-authoritative.

import type {
  BillableItem,
  PaymentIntent,
  PaymentProvider,
  PaymentStore,
  ProviderRefundResult,
} from './contract'
import {
  fulfilmentTrigger,
  parseProvider,
  resolveCountry,
  type PayConfig,
} from './config'
import {
  advance,
  crossesFulfilmentThreshold,
  mayFulfil,
  statusForEvent,
} from './machine'
import type { PaymentSink } from '../observability/index'

export interface PaymentBridgeDeps {
  config: PayConfig
  /** Keyed by provider id ('stripe', 'vnpay'). */
  providers: Record<string, PaymentProvider>
  store: PaymentStore
  sink?: PaymentSink
}

export interface CreateIntentInput {
  billableItem: BillableItem
  /** Stable per billable_item — re-calling returns the same intent (no double charge). */
  idempotencyKey: string
  metadata?: Record<string, string>
}

export interface CreateIntentResult {
  intentId: string
  status: PaymentIntent['status']
  clientSecret?: string
  checkoutUrl?: string
}

export interface ConfirmResult {
  handled: boolean
  applied: boolean
  reason?: string
  intent?: PaymentIntent
}

export interface PaymentBridge {
  createIntent(input: CreateIntentInput): Promise<CreateIntentResult>
  confirmFromWebhook(
    raw: string | Uint8Array,
    signature: string,
    providerId: string,
  ): Promise<ConfirmResult>
  refund(input: {
    intentId: string
    amountMinor?: number
    reason?: string
  }): Promise<ProviderRefundResult>
  status(intentId: string): Promise<PaymentIntent | null>
  /** Governance verdict: may the service this intent paid for start? */
  mayFulfil(intent: PaymentIntent): boolean
}

export function createPaymentBridge(deps: PaymentBridgeDeps): PaymentBridge {
  const { config, providers, store, sink } = deps
  const trigger = fulfilmentTrigger(config)

  const providerFor = (id: string): PaymentProvider => {
    const p = providers[id]
    if (!p) throw new Error(`@sys/pay: no provider registered for "${id}"`)
    return p
  }

  return {
    async createIntent({ billableItem, idempotencyKey, metadata }) {
      // Idempotent: a retried createIntent for the same billable_item is a no-op.
      const existing = await store.findIntentByIdempotencyKey(idempotencyKey)
      if (existing) {
        return { intentId: existing.id, status: existing.status }
      }

      const cc = resolveCountry(config, billableItem.country)

      // No FX in the payment path: the charge currency MUST equal the entity's currency.
      if (billableItem.amount.currency !== cc.currency) {
        throw new Error(
          `@sys/pay: currency mismatch for ${billableItem.country} — entity settles ${cc.currency}, got ${billableItem.amount.currency}`,
        )
      }

      const { id: providerId, account } = parseProvider(cc.provider)
      const provider = providerFor(providerId)

      const intent = await store.insertIntent({
        serviceRequestId: billableItem.serviceRequestId,
        country: billableItem.country,
        entity: cc.entity,
        amount: billableItem.amount,
        providerId,
        idempotencyKey,
        status: 'draft',
      })
      sink?.emit({ intentId: intent.id, type: 'intent_created' })

      const session = await provider.createCheckoutSession({
        intentId: intent.id,
        amount: billableItem.amount,
        entity: cc.entity,
        account,
        methods: cc.methods,
        sca: cc.sca,
        metadata: {
          intentId: intent.id,
          serviceRequestId: billableItem.serviceRequestId,
          ...metadata,
        },
      })
      await store.setProviderRef(intent.id, session.providerRef)

      // draft → pending (checkout exists, awaiting the customer).
      const next = advance(intent.status, 'pending')
      await store.applyTransition({
        intentId: intent.id,
        providerEventId: `checkout:${intent.id}`,
        nextStatus: next,
        providerRef: session.providerRef,
        event: {
          intentId: intent.id,
          type: 'checkout_created',
          data: { providerRef: session.providerRef },
        },
      })
      sink?.emit({ intentId: intent.id, type: 'checkout_created' })

      return {
        intentId: intent.id,
        status: next,
        clientSecret: session.clientSecret,
        checkoutUrl: session.checkoutUrl,
      }
    },

    async confirmFromWebhook(raw, signature, providerId) {
      const provider = providerFor(providerId)

      const ev = await provider.verifyWebhook({ raw, signature })
      if (!ev) return { handled: false, applied: false, reason: 'invalid_signature_or_unrecognized' }

      const intent = await store.getIntentByProviderRef(ev.providerRef)
      if (!intent) return { handled: false, applied: false, reason: 'unknown_provider_ref' }

      const target = statusForEvent(ev)
      const next = advance(intent.status, target) // throws on illegal transition

      // Emit the fulfilment outbox message EXACTLY when we first cross the threshold.
      const outbox = crossesFulfilmentThreshold(intent.status, next, trigger)
        ? {
            topic: `payment.${next}`,
            intentId: intent.id,
            serviceRequestId: intent.serviceRequestId,
            payload: {
              country: intent.country,
              entity: intent.entity,
              amount: intent.amount,
            },
          }
        : undefined

      const result = await store.applyTransition({
        intentId: intent.id,
        providerEventId: ev.providerEventId,
        nextStatus: next,
        providerRef: ev.providerRef,
        paymentMethod: ev.paymentMethod,
        capturedAmountMinor: ev.type === 'captured' ? ev.amountMinor : undefined,
        refundedAmountMinor: ev.type === 'refunded' ? ev.amountMinor : undefined,
        event: {
          intentId: intent.id,
          type: ev.type,
          providerEventId: ev.providerEventId,
          data: { raw: ev.raw },
        },
        outbox,
      })
      sink?.emit({
        intentId: intent.id,
        type: ev.type,
        providerEventId: ev.providerEventId,
        data: { applied: result.applied },
      })

      return { handled: true, applied: result.applied, intent: result.intent }
    },

    async refund({ intentId, amountMinor, reason }) {
      const intent = await store.getIntent(intentId)
      if (!intent) throw new Error(`@sys/pay: unknown intent "${intentId}"`)
      if (!intent.providerRef) throw new Error(`@sys/pay: intent "${intentId}" has no providerRef`)

      const provider = providerFor(intent.providerId)
      const res = await provider.refund({ providerRef: intent.providerRef, amountMinor, reason })

      // Webhook-authoritative: refund() only RECORDS initiation; the 'refunded' status
      // arrives via the provider's refund webhook. Status is unchanged here.
      await store.applyTransition({
        intentId: intent.id,
        providerEventId: `refund:${res.refundRef}`,
        nextStatus: intent.status,
        event: {
          intentId: intent.id,
          type: 'refund_initiated',
          data: { refundRef: res.refundRef, amountMinor: res.amountMinor, reason },
        },
      })
      sink?.emit({ intentId: intent.id, type: 'refund_initiated' })
      return res
    },

    status(intentId) {
      return store.getIntent(intentId)
    },

    mayFulfil(intent) {
      return mayFulfil(intent.status, trigger)
    },
  }
}
