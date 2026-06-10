// @sys/pay — Control-plane contract. Types only (no IO, no crypto). Defines the
// canonical money model + the injected seams (provider / store) the bridge orchestrates.
// Concrete Stripe/local-gateway adapters and the Supabase store live in the host app.

/** Supported methods. The provider enables them; we only declare intent per country. */
export type PaymentMethod =
  | 'card'
  | 'apple_pay'
  | 'google_pay'
  | 'paynow' // SG
  | 'bizum' // ES
  | 'sepa_debit' // EU
  | 'momo' // VN
  | 'zalopay' // VN
  | 'vnpay' // VN

/**
 * Intent lifecycle. `authorized` (funds held) vs `captured` (funds taken) is the
 * deliberate split fulfilment policy keys off. Terminal: refunded/failed/expired/canceled.
 */
export type IntentStatus =
  | 'draft' // created, no checkout yet
  | 'pending' // checkout session created, awaiting the customer
  | 'authorized' // funds held
  | 'captured' // funds taken
  | 'refunded' // returned (full)
  | 'disputed' // chargeback open
  | 'failed'
  | 'expired'
  | 'canceled'

/** Money in MINOR units (fils/cents/đồng) + ISO-4217 currency. Never floats. */
export interface Money {
  amountMinor: number
  currency: string
}

/** What the customer is paying for. The price is decided upstream (catalog), not here. */
export interface BillableItem {
  serviceRequestId: string
  country: string // ISO-3166-1 alpha-2
  amount: Money
  description?: string
}

/** The canonical attempt to collect money. Our object; provider refs hang off it. */
export interface PaymentIntent {
  id: string
  serviceRequestId: string
  country: string
  entity: string // the per-country legal entity (e.g. 'qarar-ae')
  status: IntentStatus
  amount: Money // charged amount+currency (== entity's local currency)
  capturedAmountMinor: number
  refundedAmountMinor: number
  providerId: string // 'stripe' | 'vnpay' | …
  providerRef?: string // e.g. Stripe PaymentIntent id
  idempotencyKey: string
  createdAt: string
  updatedAt: string
}

export type NewPaymentIntent = Pick<
  PaymentIntent,
  'serviceRequestId' | 'country' | 'entity' | 'amount' | 'providerId' | 'idempotencyKey'
> & { status: IntentStatus }

// ── Data plane: the payment provider seam (one adapter per provider) ──────────────

export interface ProviderCheckoutInput {
  intentId: string
  amount: Money
  entity: string
  account?: string // provider sub-account for the entity (e.g. Stripe connected acct)
  methods: PaymentMethod[]
  sca?: 'required' // EU/PSD2
  metadata?: Record<string, string>
}

export interface ProviderCheckoutSession {
  providerRef: string // provider-native payment id
  clientSecret?: string // embedded Payment Element
  checkoutUrl?: string // hosted redirect (alternative)
}

/** Normalized, signature-verified provider webhook. The adapter maps provider → this. */
export interface VerifiedProviderEvent {
  providerEventId: string // for idempotency (provider's event id)
  type:
    | 'authorized'
    | 'captured'
    | 'failed'
    | 'expired'
    | 'canceled'
    | 'refunded'
    | 'dispute_opened'
    | 'dispute_closed'
  providerRef: string
  amountMinor?: number
  disputeWon?: boolean // for dispute_closed
  paymentMethod?: string // 'card' | 'apple_pay' | 'google_pay' | 'paynow' … (normalized)
  raw: unknown // the raw payload, for the ledger
}

export interface ProviderRefundResult {
  refundRef: string
  amountMinor: number
  status: 'pending' | 'succeeded' | 'failed'
}

export interface ProviderPaymentSnapshot {
  providerRef: string
  status: string
  amountMinor: number
  capturedAmountMinor: number
}

export interface PaymentProvider {
  id: string
  createCheckoutSession(input: ProviderCheckoutInput): Promise<ProviderCheckoutSession>
  verifyWebhook(input: {
    raw: string | Uint8Array
    signature: string
  }): Promise<VerifiedProviderEvent | null>
  refund(input: {
    providerRef: string
    amountMinor?: number
    reason?: string
  }): Promise<ProviderRefundResult>
  getPayment(input: { providerRef: string }): Promise<ProviderPaymentSnapshot>
}

// ── Data plane: the store seam (intents + append-only ledger + outbox) ────────────

/** An append-only ledger row. Never mutated in place. */
export interface PaymentEvent {
  intentId: string
  type: string // 'intent_created' | 'checkout_created' | 'captured' | 'refund_initiated' | …
  providerEventId?: string
  data?: Record<string, unknown>
}

/** Emitted in the SAME transaction as the ledger row when fulfilment becomes allowed. */
export interface OutboxMessage {
  topic: string // 'payment.captured' | 'payment.authorized'
  intentId: string
  serviceRequestId: string
  payload: Record<string, unknown>
}

export interface ApplyTransitionInput {
  intentId: string
  providerEventId: string // idempotency key for the transition
  nextStatus: IntentStatus
  capturedAmountMinor?: number
  refundedAmountMinor?: number
  providerRef?: string
  paymentMethod?: string // recorded on the intent when the provider reports it (at capture)
  event: PaymentEvent
  outbox?: OutboxMessage
}

export interface ApplyTransitionResult {
  intent: PaymentIntent
  /** false when the providerEventId was already applied (idempotent duplicate). */
  applied: boolean
}

/**
 * Persistence seam. The adapter MUST make `applyTransition` atomic (advance intent +
 * append ledger event + enqueue outbox in one transaction) and idempotent on
 * `providerEventId` — that is what makes a duplicate webhook a safe no-op.
 */
export interface PaymentStore {
  findIntentByIdempotencyKey(key: string): Promise<PaymentIntent | null>
  insertIntent(intent: NewPaymentIntent): Promise<PaymentIntent>
  setProviderRef(intentId: string, providerRef: string): Promise<void>
  getIntent(intentId: string): Promise<PaymentIntent | null>
  getIntentByProviderRef(providerRef: string): Promise<PaymentIntent | null>
  applyTransition(input: ApplyTransitionInput): Promise<ApplyTransitionResult>
}
