# @sys/billing

Commercial-document subsystem: **invoices + credit notes** issued from policy-governed payment events. Reusable across apps; jurisdiction behavior (tax, timing, numbering, rendering, e-invoice transport) is isolated behind one `InvoicePolicy` so **adding a country = adding a policy**, never touching the core.

**Plane:** governance (primary), control, data, observability  ·  part of the `@sys/*` reusable-subsystem monorepo. Consumes `@sys/pay` events (`payment.captured` → invoice; refund → credit note). Design: [`docs/sys-billing-design.md`](../../docs/sys-billing-design.md).

## Install

```json
"@sys/billing": "file:vendor/sys-billing-0.0.1.tgz"
```

## API

- `createBillingBridge({ store, policies, idFactory }): BillingBridge` — orchestration (Control). `issueInvoiceFromCapture(...)` (idempotent on the source event id) / `issueCreditNoteFromRefund(...)`. Provider/store injected; imports nothing app-specific.
- **`InvoicePolicy`** (the extension point, one per jurisdiction): `billingMode` (`paid_only|on_supply|hybrid`), `creditNoteStyle` (`referencing|rectifying`), `classifyLine` (category + rate + evidence), `computeTax`, `requiredFields`, `validateDraft`, `renderInvoice/renderCreditNote`, optional `eInvoice` (PINT-AE/PEPPOL/Facturae transport).
- `createUaePolicy()` (`@sys/billing/policy-uae`) — UAE: VAT 5%, disbursement-by-evidence, B2B TRN, `AE-2026-NNNNNN` numbering, HTML "Tax Invoice".
- Pure core (`@sys/billing/core`): `computeTax`, `documentTotals`, `formatDocumentNumber`, `contentHash`, `formatMoney`, the `CommercialDocument` model, the injected `BillingStore` seam.
- `renderDocumentHtml(doc)` — print-ready HTML (→ host turns into the emailed PDF).

## Adding a country

1. Implement `InvoicePolicy` for the jurisdiction (e.g. `createSgPolicy()` / `createEsPolicy()`) — its own `JurisdictionTaxConfig` (rates/label/categories/rounding), `billingMode`, `creditNoteStyle`, `requiredFields`, and a renderer (language + layout).
2. Add an `eInvoice` adapter if the regime mandates structured transport (SG/EU PEPPOL-BIS, ES Facturae/UBL + platform connector).
3. Register it: `createBillingBridge({ policies: { AE, SG, ES } })`. Numbering uses a per-entity series (`AE-…`, `SG-…`, `ES-…`; ES gets a separate corrective series).

The core, the document model, and the bridge never change. UAE/SG/ES differ only in their policy.

## Usage

```ts
import { createBillingBridge } from '@sys/billing'
import { createUaePolicy } from '@sys/billing/policy-uae'

const billing = createBillingBridge({ store, policies: { AE: createUaePolicy() }, idFactory })
const invoice = await billing.issueInvoiceFromCapture({ sellerEntity, billingAccount, lines, sourceEvent, ... })
const { html, pdf, contentHash } = policy.renderInvoice(invoice)   // → email as PDF
```

## Non-negotiables

Invoices immutable; credit-note-only corrections; numbering gapless with cancelled-in-sequence; issuance idempotent on the source event; party snapshots frozen on the document; tax is jurisdiction-owned (nothing tax-specific is global).
