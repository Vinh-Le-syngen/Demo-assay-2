# @sys/pay — design (v2, implementation spec)

> Reusable, configurable payment subsystem. Headless Control core + injected provider/store seams,
> the same shape as `@sys/auth`. Turns "customer wants a service" into "payment confirmed →
> fulfilment allowed," provider-agnostic and configurable per country.
>
> **Status:** v2 — incorporates an external architecture review (validated the core: webhook-
> authoritative, provider-adapters-behind-a-bridge, service-start-as-event, hosted-checkout/PCI;
> added the **money-grade boundaries** that v1 was light on — ledger/event model, transactional
> outbox, fulfilment-safety policy, regulatory ownership, SCA/disputes/tax/FX).
> **MVP scope is deliberately narrow** (see below). Tracked: Qarar ENG-1819 (+ ENG-1820..1823).

## What it owns — the 5 planes (planes lead)

`@sys/pay` owns **Control**: the payment-intent lifecycle + the *fulfilment verdict* ("may the thing
this paid for start?"). Provider specifics, money policy, and durability live in the other planes.

| Plane | Contents |
|---|---|
| **Control** (owned) | intent state machine (pure); `createPaymentBridge` surface (`createIntent` / `confirmFromWebhook` / `refund` / `status`); the fulfilment verdict; `definePay` composition root |
| **Data** | provider adapters (Stripe, local gateways) — `createCheckoutSession` / `verifyWebhook` / `refund` / `getPayment`; the store (intents, the append-only event ledger, raw provider payloads). Concrete IO/crypto. **Injected.** |
| **Governance** | config schema; **fulfilment-safety policy** (which states allow start, per product type); allowed transitions; country/provider/method policy; **merchant/seller-of-record + tax/refund/currency rules**; the stable contract |
| **Recovery** | reconciliation (settlements ↔ intents), webhook replay, expiry sweeps, **dispute/chargeback** handling, refund recovery, compensations, degraded mode |
| **Observability** | metrics/traces, the audit view over the event ledger, anomaly/decline alerts. Emits; never decides. |

Like `@sys/auth` doesn't provision profiles, **`@sys/pay` doesn't know what a "service" is.** It
confirms money and emits a durable event; the app's workflow engine starts the service. No coupling.

## Canonical data model (the money-grade spine)

Separate **money records from business state**, with an immutable audit trail:

- **`billable_item`** — what the customer is paying for (a service/bundle + amount + currency).
- **`payment_intent`** — the canonical attempt to collect money (status machine below). Our object.
- **`provider_payment`** — provider-native reference(s) (Stripe PaymentIntent id, etc.) + raw payload.
- **`payment_event`** — **append-only, immutable ledger**: intent_created → checkout_created →
  webhook_received → verified → authorized → captured → refund_initiated → refund_completed →
  dispute_opened → dispute_won/lost. Every state change is a row; nothing is mutated in place.
- **`refund`** — partial/full, reason, link to the intent; affects the fulfilment verdict.
- **`dispute`** — first-class (not a back-office afterthought): opened/evidence/won/lost lifecycle.

Without this split, refunds, duplicate webhooks, quote→payment, and chargeback forensics get messy.

## Core API (mirrors `@sys/auth`)

```ts
definePay({                                    // validated composition root (zod)
  // each country = its own legal entity + provider account + bank account, in local currency.
  countries: {
    AE: { entity: 'qarar-ae', currency: 'AED', provider: 'stripe:acct_ae',
          methods: ['card', 'apple_pay', 'google_pay'] /* + tabby… */ },
    SG: { entity: 'qarar-sg', currency: 'SGD', provider: 'stripe:acct_sg',
          methods: ['card', 'apple_pay', 'google_pay', 'paynow'] },
    ES: { entity: 'qarar-es', currency: 'EUR', provider: 'stripe:acct_es', sca: 'required' /* EU */,
          methods: ['card', 'apple_pay', 'google_pay'] },
    VN: { entity: 'qarar-vn', currency: 'VND', provider: 'vnpay:acct_vn',  // local entity → local gateway
          methods: ['card', 'apple_pay', 'google_pay', 'momo', 'zalopay', 'vnpay'] },
  },
  fulfilment: { startsOn: 'captured' },        // Governance policy (see below)
}): PayConfig

createPaymentBridge({ config, providers, store, outbox, sink? }): PaymentBridge
//   createIntent(...)        → { intentId, checkoutUrl|clientSecret, status }   (idempotent per billable_item)
//   confirmFromWebhook(raw, sig, providerId)  → verify → advance → append event → enqueue outbox (one txn)
//   refund({ intentId, amount?, reason }) → RefundResult
//   status(intentId) → PaymentIntent
```

### Provider seam — **keep it THIN** (don't invent a universal payments ontology)

```ts
interface PaymentProvider {                    // Data plane; one per provider
  id: string
  createCheckoutSession(input): Promise<ProviderCheckoutSession>   // hosted/tokenized; SCA-ready
  verifyWebhook(input): Promise<VerifiedProviderEvent | null>      // signature-checked + normalized
  refund(input): Promise<ProviderRefundResult>
  getPayment(input): Promise<ProviderPaymentSnapshot>              // for reconciliation
}
```
Subscriptions, invoicing, wallets, payouts are **NOT** on this interface in v1 — they reuse
primitives later. Over-abstracting now makes the bridge mushy and Stripe leaks everywhere anyway.

### Intent state machine (Control)

`draft → pending → authorized → captured → [refunded | disputed]`. Pure, no IO (like the `@sys/auth`
session machine). The split between **authorized** (funds held) and **captured** (funds taken) is
deliberate — fulfilment policy decides which is enough.

## Fulfilment-safety policy (Governance — not just orchestration)

*Which payment state is enough to start the service is policy, per product type:*
- Default: **`captured`** allows start (money actually taken).
- Cheap/low-risk products may allow start on **`authorized`**; high-value/irreversible work may
  require **settled** (funds cleared) before any irreversible step.
- **On later refund/dispute:** define whether fulfilment pauses/reverses (a service mid-flight when a
  chargeback lands needs an explicit compensation path — Recovery).
This lives in config (`fulfilment.startsOn`), not in app branches.

## Service start = a **transactional outbox** event (not a best-effort publish)

Money events need durability. `confirmFromWebhook`:
1. Verify the webhook signature (Data).
2. Advance the intent + append the `payment_event` row (Control) — **idempotently**.
3. Persist an **outbox** record **in the same transaction**.
4. Deliver the outbox event to the workflow engine (at-least-once).
5. Workflow engine advances `awaiting_payment → active` **idempotently**.

So: event-driven decoupling, but with outbox/saga discipline — payment confirmation and the
fulfilment trigger can never drift apart, and a duplicate webhook can't double-start.

## Non-negotiables (Governance)

- **Webhook-authoritative** — only `confirmFromWebhook` (signed, server-to-server) advances state;
  the browser redirect is UX only.
- **Idempotency** — `createIntent` per billable_item; `confirmFromWebhook` per provider event id.
- **PCI** — hosted checkout / tokenization only; neither package nor app ever sees a card (SAQ-A).
- **SCA / 3DS** — for EU/Spain, Strong Customer Authentication is mandatory. Explicitly handle
  `requires_action` / authentication-required / incomplete states; don't treat them as failures.

## Regulatory ownership (own it explicitly)

- **The per-country Qarar entity is the seller / merchant of record in its own jurisdiction.** Stripe
  (and local gateways) are **payment rails / a payfac**, not the MoR. So **each entity owns**: its
  local **tax/VAT** calculation + remittance, invoices/receipts as the source of truth, customer
  commercial liability, and **dispute operations** — in its jurisdiction. (Per-entity SoR, not one
  global SoR — which the local-entity-and-account model makes natural.)
- **Do not default to a MoR provider (Paddle/Lemon Squeezy).** Those fit digital-SaaS sales; Qarar
  sells **multi-country operational services** through local entities — an awkward MoR fit. Keep the
  local entity as SoR; treat tax/invoicing/compliance as **per-jurisdiction owned concerns**.

## Currency — settled by the per-country-entity model

**Structural fact (decided): each country is its own legal entity with its own merchant + bank
account in the local currency** (UAE entity → AED account, SG → SGD, ES → EUR, VN → VND). This
**resolves currency for the payment layer**:

- **Presentment = settlement = the country's local currency.** A customer pays AED, the UAE entity
  settles AED into its AED account. **No FX anywhere in the payment path** — no provider FX, no
  cross-border conversion, no over/under-refund risk on FX.
- **Each entity is the seller/merchant of record in its own jurisdiction** and owns its local
  **tax/VAT, invoicing, and dispute ops** there. (So "SoR" is per-entity, not one global SoR.)
- **FX appears only at group consolidation** — when the parent rolls country results into a base
  reporting currency. That's a **finance/treasury concern, outside `@sys/pay`** (it just records the
  local-currency facts faithfully).

**Pricing is upstream, not `@sys/pay`'s job.** The catalog (`service_offerings.price_amount` +
`price_currency`, currency-neutral per ADR-0006) decides the price; `@sys/pay` receives an
**amount + currency to charge** and an `entity`, and charges it. It doesn't price.

What `@sys/pay` still stores per intent (one currency, but keep the legs distinct on the event
ledger): charged amount+currency · captured amount · settled amount (confirms the payout) · refunded
amount. All in the entity's local currency, so reconciliation is single-currency per entity.

Remaining decision (only one, and it's finance not payment): the **group base/reporting currency** +
rate convention for consolidation.

## Build vs buy — the boundary (decided)

`@sys/pay` is an **orchestration/control layer, not a payment platform.** We rent the regulated,
commodity-but-hard rails and build only the thin smart layer that encodes Qarar's business rules.
This matches the `@sys/*` strategy: own the part that's *yours*, inject the part that isn't.

| Layer | Build / Buy | Why |
|---|---|---|
| PSP / gateway / acquiring (Stripe, local gateways) | **Buy** | Regulated, certified scheme connectivity; already solved; not a differentiator |
| Card vault / tokenization | **Buy** (hosted → SAQ-A) | Self-vaulting = SAQ-D, audits, pen-tests, a security team. Never. |
| 3DS / SCA, fraud scoring, network tokens | **Buy** | Models trained on volumes we'll never have |
| Apple Pay / Google Pay enablement | **Buy** (via the PSP) | Wallet wrappers over card rails; the PSP enables them |
| Tax / VAT engine | **Buy or defer** | Build only if forced; per-entity local accounting owns it for now |
| Commerce platform (Shopify-style catalog/cart/storefront) | **Skip** | Solves the wrong business shape — Qarar sells multi-country regulated *services*, not SKUs |
| Merchant of record (Paddle/Lemon Squeezy) | **Avoid for now** | Fits digital-SaaS; awkward for local-entity service business. Per-entity SoR instead. |
| Payment **orchestration / policy / ledger** (`@sys/pay`) | **Build** | This is where the service-workflow + country logic + money truth live. Ours. |

**The value those external services give us is not "they let us take payments" — it's "they absorb
payment complexity we don't want to own."** Use them underneath; don't let them define the product
architecture.

## MVP cut line — what v1 may ignore vs. must implement

Apple Pay / Google Pay + cards via one PSP simplify the **surface** (less method sprawl, better
mobile conversion, no card storage). They do **not** simplify the **money system** — under the hood
it's still a card payment with auth/capture, webhooks, refunds, disputes. So the cut line is about
*method/feature breadth*, never about *merchant responsibility*.

**v1 may safely defer:** local methods (MoMo/ZaloPay/VNPay/PayNow beyond the first cut), subscriptions
& dunning, partner payouts/commissions, a tax engine, full invoicing, multi-PSP routing, quote→invoice
flows (modeled, not built).

**v1 must still implement even with only Apple/Google/card:** webhook-authoritative confirmation,
idempotency (intent + event), auth-vs-capture, refunds (designed in, even if ops-triggered),
dispute/chargeback handling path, the append-only event ledger, the transactional outbox →
fulfilment gate, per-country currency/entity policy, reconciliation. **You can simplify the surface;
you cannot simplify the money system.**

## MVP scope — brutally narrow
- **One-time payments only.** Hosted checkout only. **Stripe adapter only** (card + Apple Pay +
  Google Pay for AE/SG/ES + VN-foreigners; PayNow in SG).
- `quote` / `invoice` **modeled in the data model, not fully implemented** yet.
- **Subscriptions deferred** (different state handling — incomplete/past_due/dunning).
- **Partner payouts / commissions are a separate subsystem** — keep them out of `@sys/pay` v1.

## How Qarar consumes it
`providers`: `StripeProvider` (MVP) + later `VnpayProvider`. `store`/`outbox`: Supabase-backed
(reuse/extend the existing `payments` table; add the `payment_event` ledger + outbox). amount/currency
from `service_offerings`. The `captured` outbox event → the workflow engine's `awaiting_payment →
active`. `@sys/pay` imports none of these — injected, so it stays headless + reusable.

## Vietnam rail selection policy (doctrine)

VN is a **second adapter boundary**, not something forced onto the Stripe-first rail — Stripe
doesn't acquire for VN-registered merchants, and the VN entity settles VND through a local gateway.
The choice is config (which `PaymentProvider`), never code branches. Decision tree:

```txt
VN strategy:
1. Assume VN is its own adapter boundary (separate from Stripe).
2. Evaluate 2C2P first — likely best SINGLE-adapter fit: international cards + Apple/Google
   Pay + VN-local methods (MoMo/ZaloPay/QR) behind one regional integration.
3. Keep VNPay as the strongest local fallback — favour it if resident QR / domestic-bank
   behaviour matters more than elegant cross-border coverage, or terms are materially better.
4. Use OnePay only if the actual mix proves international-card / tourist-heavy.
5. Split VN cards vs wallets across two providers ONLY as a last resort (no single rail good enough).
```

**Two blocking confirmations before locking VN** (genuinely open; not guessable from here):

1. **Commercial / legal routing** — which entity is merchant/acquirer-facing for a VN transaction?
   Is the **VN entity** the merchant using a local acquirer, or does a non-VN entity sell cross-border
   into VN for some customer types? This decides whether VN is just a local-method optimisation or a
   hard jurisdiction-specific payment boundary.
2. **Coverage / ergonomics** — can ONE VN adapter actually do: international cards · Apple/Google Pay
   quality (web+app) · MoMo/ZaloPay/QR · refunds · webhook quality · settlement/reconciliation
   ergonomics? That answer is the single-adapter-vs-split-rails verdict.

Until both are confirmed, VN stays **deferred** (MVP is Stripe AE/SG/ES + VN-foreigner cards). This
policy keeps the architecture clean without pretending the market question is solved.

## Open decisions
- **VN rail** — resolved to a *policy* (above), pending the two confirmations. Not a code decision.
- Group **base/reporting currency** + consolidation rate convention (finance).
- One webhook endpoint per provider vs per country.
- Reconciliation cadence + the per-entity dispute-ops runbook owner.

## v1 implementation spec — next artifacts to write
Per the review, promote this to implementation: (1) the canonical schema (the 6 entities + outbox),
(2) the intent state machine, (3) the outbox event contract, (4) the Stripe adapter contract,
(5) the fulfilment-gate policy. This doc is the governing spec for v1.

---
*v2 incorporates an external architecture review (Stripe Payment Intents/webhooks, payfac-vs-MoR,
SCA/PSD2, transactional outbox). Core design unchanged; money-grade boundaries added.*
