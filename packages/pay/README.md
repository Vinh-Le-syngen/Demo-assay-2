# @sys/pay

Control-plane payment orchestration subsystem: turns "customer wants a service" into "payment confirmed → fulfilment allowed", provider-agnostic and configurable per country/entity. Headless — concrete providers (Stripe, local gateways) and the store/outbox are **injected**, the same shape as `@sys/auth`.

**Plane:** control (primary), governance, data, observability, recovery  ·  part of the `@sys/*` reusable-subsystem monorepo.

Design: [`docs/sys-pay-design.md`](../../docs/sys-pay-design.md).

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@sys/pay": "file:vendor/sys-pay-0.0.1.tgz"
```

## API

- `definePay(config): PayConfig` — composition root (zod). Per-country config: `{ entity, currency, provider:'<id>:<account>', methods[], sca? }` + `fulfilment.startsOn`. Each country = its own legal entity + provider account + bank account in the local currency (presentment = settlement, **no FX in the payment path**).
- `createPaymentBridge({ config, providers, store, sink? }): PaymentBridge` — the orchestration surface (Control, no IO):
  - `createIntent({ billableItem, idempotencyKey })` → `{ intentId, status, clientSecret|checkoutUrl }`. Idempotent per `idempotencyKey`; rejects a charge whose currency ≠ the entity's.
  - `confirmFromWebhook(raw, signature, providerId)` → verify → advance the intent → append the ledger event → enqueue the fulfilment outbox **(one transaction, idempotent on the provider event id)**. The only path that advances state.
  - `refund({ intentId, amountMinor?, reason })` — records initiation; the `refunded` status arrives via the provider's refund webhook.
  - `status(intentId)` / `mayFulfil(intent)` — the governance verdict.
- Pure intent machine (`@sys/pay/core`): `advance`, `canTransition`, `statusForEvent`, `mayFulfil`, `crossesFulfilmentThreshold`. `draft → pending → authorized → captured → [refunded | disputed]`; `authorized` vs `captured` is the split fulfilment policy keys off.
- Injected seams (contract types): `PaymentProvider` (`createCheckoutSession` / `verifyWebhook` / `refund` / `getPayment`), `PaymentStore` (intents + append-only ledger + atomic `applyTransition`).
- `PaymentSink`, `noopSink` (`@sys/pay/observability`) — the injectable telemetry seam.

## Usage

```ts
import { definePay, createPaymentBridge } from '@sys/pay'

const config = definePay({
  countries: {
    AE: { entity: 'qarar-ae', currency: 'AED', provider: 'stripe:acct_ae', methods: ['card', 'apple_pay', 'google_pay'] },
  },
  fulfilment: { startsOn: 'captured' },
})

const pay = createPaymentBridge({ config, providers: { stripe: stripeProvider }, store: supabaseStore })

// 1. checkout
const { clientSecret } = await pay.createIntent({
  billableItem: { serviceRequestId, country: 'AE', amount: { amountMinor: 840000, currency: 'AED' } },
  idempotencyKey: `${serviceRequestId}:company_formation`,
})

// 2. webhook (authoritative) — advances state + emits the "start the service" outbox event
const { applied } = await pay.confirmFromWebhook(rawBody, sigHeader, 'stripe')
```

## Extend via

A `PaymentProvider` adapter (one per rail — Stripe, VNPay…) + a `PaymentStore` adapter (intents, the append-only `payment_event` ledger, and the outbox — `applyTransition` MUST be atomic + idempotent on the provider event id).

## Non-negotiables

Webhook-authoritative · idempotent (intent per billable_item, transition per provider event id) · PCI hosted/tokenized (SAQ-A) · per-entity seller-of-record (local tax/VAT/disputes) · service-start as a transactional-outbox event (no double-start on duplicate webhooks).
