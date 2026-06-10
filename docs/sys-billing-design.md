# @sys/billing — design (v2, incorporates external review)

> Minimal, strict invoicing + credit-note subsystem for Qarar's service business. Separate from
> `@sys/pay`: `@sys/pay` is authoritative for **money facts**; `@sys/billing` is authoritative for
> **commercial-document facts** and persists its own immutable "document issued because of event X"
> record. Multi-entity, multi-country; tax, timing, numbering, and rendering are **policy-driven**,
> not package law. UAE-first.
>
> **Status:** v2 — folds in an external tax/billing review. Key shifts from v1: issuance timing is
> a policy (`billingMode`), not a global invariant; numbering keeps **cancelled documents in the
> sequence** (no hidden gaps); disbursement is decided **per line by evidence**, not a coarse map;
> tax splits into **category / rate / basis**; rendered docs are **frozen artifacts** with a
> canonical payload + content hash + an e-invoicing seam; documents store **party snapshots**;
> issuance is **idempotent on the source event**. No code/schemas yet.

## Why a separate package (not part of @sys/pay)

`@sys/pay` changes on **payment-rail** timelines (Stripe, 2C2P, webhooks); `@sys/billing` changes on
**tax / record-keeping** rules. Event-coupling is the right boundary:
- `@sys/pay` = money movement + the fulfilment verdict (Control). Authoritative for **money facts**.
- `@sys/billing` = legal commercial **documents** (Governance). Authoritative for **document facts**.
- It does **not** project over payment state — on `payment.captured` it persists its own immutable
  "invoice issued because of event X" record; on a confirmed refund, a credit note.

Connected by event, not import. `@sys/billing` never moves money; `@sys/pay` never issues documents.

## Doctrine

1. **Invoices and credit notes are immutable commercial records issued from policy-governed
   events.** Once issued, never edited or deleted (append-only).
2. **Issuance timing is jurisdiction policy, not a global invariant.** A `billingMode` per policy:
   `paid_only | on_supply | hybrid`. **Qarar UAE v1 = `paid_only`** (payment receipt is the VAT tax
   point for advance payment, so issuing on capture is correct). SG/ES/VN may use `on_supply` later
   (e.g. SG requires a tax invoice to GST-registered customers within 30 days of *time of supply*,
   which can exist independently of payment) — without making the package structurally wrong.
3. **The credit note is the only correction instrument** — full/partial refund, price reduction,
   goodwill, wrong tax — referencing the original invoice id + number + (where possible) line, with
   the tax-adjusting amount.
4. **Numbering: sequential per seller entity *and* document type; cancelled numbers stay in the
   sequence and are never reused.** A failed issuance becomes a **cancelled document in sequence**,
   not a hidden gap. (Allocate → persist shell → issue *or* cancel → never delete, never reuse.)
5. **Tax treatment is determined per line from category + jurisdiction policy + *evidence*.** Service
   defaults may *assist* but never override factual requirements (e.g. disbursement conditions).
   Nothing tax-specific is global — rates/labels/rounding/categories live in each policy.
6. **Documents store snapshots of buyer + seller tax state** (name, address, TRN/GST, country,
   B2B/B2C, the seller registrations shown). An invoice is a historical record, not a view over the
   live `BillingAccount`.
7. **Rendered documents are frozen artifacts** — a canonical structured payload + a versioned render
   (HTML now, PDF later) + a content hash — designed up front for e-invoicing transport (PINT-AE /
   PEPPOL / ES SII / VN), not a render-only afterthought.
8. **Every issuance is idempotent on its source event** (event id + payment/refund id + seller
   entity + document kind) — webhook replays and workflow retries can't mint duplicates.
9. **Per-entity seller-of-record; one currency per document** (= the entity's; no FX).

### What v1 does NOT support (deliberately)
- ❌ Quotes / full AR. **(Pro-forma is *reserved* as a non-tax artifact — see below — not built unless needed.)**
- ❌ Pay-later / terms / dunning / open invoices.
- ❌ Editing or deleting issued documents.
- ❌ Multi-currency on a single document.
- ❌ Consolidated group reporting (finance, outside the package).
- ❌ E-invoicing **clearance/transport** (the seam is designed; transmission is not built).
- ❌ Generic accounting (no GL/AR aging).

### Pro-forma — reserved, non-tax (per review)
A `ProForma` / `PaymentRequest` is a **non-tax commercial artifact** for B2B buyers / banks / ops who
want a pre-payment document. It is **outside** invoice numbering, tax, and ledger semantics — a
structured price summary, never a tax document. Reserved in the model; built only if demand appears.

---

## Domain model (TypeScript types — shared, framework-agnostic)

```ts
interface Money { amountMinor: number; currency: string }   // minor units + ISO-4217

// Issuance timing is POLICY, not a global invariant.
type BillingMode = 'paid_only' | 'on_supply' | 'hybrid'      // UAE v1 = paid_only

// ── Seller entity = the per-country legal entity / merchant of record ──
interface SellerEntity {
  id: string                       // 'qarar-ae'
  legalName: string
  country: string                  // ISO-3166-1 alpha-2
  jurisdiction: string             // policy key
  taxRegistrations: TaxRegistration[]
  address: PostalAddress
  currency: string                 // settlement currency == document currency
  branding?: { logoUrl?: string; footer?: string }
}
interface TaxRegistration { kind: 'trn' | 'vat' | 'gst' | 'nif' | 'mst'; number: string; country: string }
interface PostalAddress { line1: string; line2?: string; city: string; region?: string; postalCode?: string; country: string }

// ── Billing account = the LIVE customer record ──
interface BillingAccount {
  id: string
  kind: 'individual' | 'business'
  name: string
  email?: string
  taxId?: { kind: string; number: string }   // B2B
  address?: PostalAddress
  country: string
}

// Snapshots frozen onto the document — historical record, not a live view.
interface PartySnapshot {
  name: string
  kind: 'individual' | 'business'
  country: string
  address?: PostalAddress
  taxId?: { kind: string; number: string }
}
interface SellerSnapshot {
  legalName: string
  country: string
  address: PostalAddress
  taxRegistrations: TaxRegistration[]   // exactly as printed on the document
}

// ── Tax: classification / rate / basis are SEPARATE (same category, different evidentiary base
//    across jurisdictions). Rates/labels/rounding/categories are per-jurisdiction config, never global.
type TaxCategory = 'standard' | 'reduced' | 'zero_rated' | 'exempt' | 'out_of_scope' | 'reverse_charge'
interface TaxRateSnapshot { label: string; ratePct: number }   // 'VAT' 5 · 'IVA' 21 · 'GST' 9 · 'VAT' 10
interface TaxBasisEvidence {                  // WHY this line got this category (audit/defence)
  reason: string
  placeOfSupply?: string                      // jurisdiction assessed as place of supply (cross-border)
  disbursement?: DisbursementEvidence         // for a government_fee passed through
}
interface TaxTreatment { category: TaxCategory; rate: TaxRateSnapshot; basis?: TaxBasisEvidence }

// Disbursement (out_of_scope) is legitimate ONLY when the facts hold (UAE FTA). Captured per line.
interface DisbursementEvidence {
  authorizedAsAgent: boolean
  invoiceInCustomerName: boolean
  exactPassThrough: boolean        // no markup
  separatelyItemized: boolean
}

// ── Line items — typed categories; final tax decided per line (category + policy + evidence) ──
type LineCategory = 'qarar_service_fee' | 'government_fee' | 'partner_fee' | 'discount'
interface InvoiceLine {
  id: string
  category: LineCategory
  description: string
  quantity: number
  unitAmount: Money
  netAmount: Money                 // negative for discount
  tax: TaxTreatment
  metadata?: Record<string, unknown>
}
interface TaxBreakdown {
  groups: Array<{ category: TaxCategory; label: string; ratePct: number; taxableBase: Money; taxAmount: Money }>
  totalTax: Money
  rounding: 'per_line' | 'per_document'   // jurisdiction-set, applied consistently
}

// ── Source event — the idempotency + provenance anchor for every issuance ──
interface SourceEvent {
  kind: 'payment.captured' | 'payment.refunded' | 'admin.correction'
  eventId: string                  // dedup key (webhook replay / retry safe)
  paymentIntentId?: string         // @sys/pay intent id
  providerRef?: string             // pi_… / re_…
}

// ── Documents — precise lifecycle; the sequence keeps cancelled shells (no gaps) ──
type DocumentKind     = 'invoice' | 'credit_note'
type InvoiceStatus    = 'number_reserved' | 'issued_paid' | 'cancelled'
type CreditNoteStatus = 'number_reserved' | 'issued' | 'linked_to_refund' | 'cancelled'
type CreditNoteReason = 'full_refund' | 'partial_refund' | 'price_reduction' | 'goodwill' | 'tax_correction' | 'overcharge'

interface CommercialDocumentBase {
  id: string
  kind: DocumentKind
  number: string                   // jurisdiction-assigned; stays in sequence even if cancelled
  sellerEntityId: string
  sellerSnapshot: SellerSnapshot
  billingAccountId: string
  buyerSnapshot: PartySnapshot
  serviceRequestId: string
  currency: string
  lines: InvoiceLine[]
  netTotal: Money
  taxBreakdown: TaxBreakdown
  grossTotal: Money
  jurisdiction: string
  sourceEvent: SourceEvent
  paymentApplications: PaymentApplication[]
  rendered?: RenderedDocument
  issuedAt?: string                // set on issue; absent while number_reserved
  cancelledAt?: string
  metadata?: Record<string, unknown>
}
interface Invoice extends CommercialDocumentBase {
  kind: 'invoice'
  status: InvoiceStatus
}
interface CreditNote extends CommercialDocumentBase {
  kind: 'credit_note'
  status: CreditNoteStatus
  correctsInvoiceId: string
  correctsInvoiceNumber: string
  correctsLineIds?: string[]       // line-level linkage where possible
  reasonCode: CreditNoteReason
  reasonText?: string
}
type CommercialDocument = Invoice | CreditNote

// ── How PSP money maps onto documents (the link back to @sys/pay) ──
interface PaymentApplication {
  kind: 'charge' | 'refund'
  provider: string
  providerRef: string              // pi_… / re_…
  paymentIntentId: string
  amount: Money
  appliedAt: string
}

// ── Frozen rendered artifact — canonical payload + versioned render + hash, e-invoicing-ready ──
interface RenderedDocument {
  canonical: object                // canonical structured payload — the source of truth for re-render
  renderVersion: string
  html?: string                    // frozen snapshot
  pdf?: { storageRef: string }     // frozen snapshot (later)
  contentHash: string              // tamper-evidence
  eInvoice?: { format: string; payload: object }   // PINT-AE / PEPPOL / SII / VN — future seam
  filename: string
}

// ── Per-jurisdiction policy + config (Governance) — nothing here is global ──
interface JurisdictionTaxConfig {
  label: string                                       // 'VAT' | 'GST' | 'IVA'
  rates: Record<string, number>                       // named rates → percent (multi-rate ok)
  categoryTreatment: Record<LineCategory, TaxCategory> // default category per line category
  serviceTax?: ServiceTaxMap                          // DEFAULT hints only — never override evidence
  rounding: 'per_line' | 'per_document'
}
interface ServiceTaxRule { govFeeTreatment: 'disbursement' | 'resale' }
type ServiceTaxMap = Record<string /* serviceId */, ServiceTaxRule>
interface NumberingConfig { invoicePrefix: string; creditNotePrefix: string; annualReset: boolean; pad: number }
interface PolicyConfig { billingMode: BillingMode; tax: JurisdictionTaxConfig; numbering: NumberingConfig }

interface InvoicePolicy {
  jurisdiction: string
  billingMode: BillingMode
  validateDraft(ctx: PolicyContext, doc: DocumentDraft): ValidationResult
  classifyLine(ctx: PolicyContext, line: InvoiceLine): TaxTreatment   // category + rate + basis evidence
  computeTax(ctx: PolicyContext, lines: InvoiceLine[]): TaxBreakdown
  requiredFields(ctx: PolicyContext): FieldSpec[]                     // incl. conditional B2B TRN, place-of-supply
  renderInvoice(ctx: PolicyContext, invoice: Invoice): RenderedDocument
  renderCreditNote(ctx: PolicyContext, creditNote: CreditNote): RenderedDocument
}
interface PolicyContext { sellerEntity: SellerEntity; billingAccount: BillingAccount; now: string }
interface ValidationResult { ok: boolean; errors: Array<{ field: string; message: string }> }
interface FieldSpec { field: string; required: boolean; label: string }
type DocumentDraft = Omit<CommercialDocumentBase, 'id' | 'number' | 'issuedAt' | 'rendered'>

// ── Injected seams (Data) — atomic number reservation; cancelled shells stay in sequence ──
interface BillingStore {
  findDocumentBySourceEvent(eventId: string): Promise<CommercialDocument | null>   // idempotency
  reserveNumber(jurisdiction: string, sellerEntityId: string, year: number, kind: DocumentKind):
    Promise<{ number: string; documentId: string }>                               // atomic; persists a number_reserved shell
  finalizeDocument(doc: CommercialDocument): Promise<void>                          // number_reserved → issued_*
  cancelDocument(documentId: string, reason: string): Promise<void>                // → cancelled; number stays in sequence
  getInvoice(id: string): Promise<Invoice | null>
}

// ── Pro-forma — NON-TAX commercial artifact. Outside numbering / tax / ledger. ──
interface ProForma {
  id: string
  serviceRequestId: string
  sellerEntityId: string
  currency: string
  lines: Array<{ description: string; amount: Money }>   // price summary, NOT tax lines
  total: Money
  createdAt: string
  expiresAt?: string
}
```

---

## v1 cut-line (UAE-first)

**Implement now (Qarar AE v1):**
- `SellerEntity` `qarar-ae` + **UAE `InvoicePolicy`** with `billingMode: 'paid_only'`:
  - tax config `{ label:'VAT', rates:{ standard:5 }, categoryTreatment:{ qarar_service_fee:'standard',
    government_fee:'out_of_scope', partner_fee:'standard', discount:'standard' }, rounding:'per_line' }`.
  - **`classifyLine` decides disbursement per line by evidence** — a `government_fee` is `out_of_scope`
    only when `DisbursementEvidence` holds (agent, customer-name invoice, exact pass-through, itemized);
    otherwise it's a taxable reimbursement. `ServiceTaxMap` only seeds the default.
  - **B2B:** customer TRN conditionally required when `kind==='business'`, printed on the invoice.
  - numbering `AE-2026-000123` / `AE-CN-2026-000045`, gapless **with cancelled-in-sequence**, atomic
    `reserveNumber`, annual reset per entity.
  - **party snapshots** frozen onto every document.
  - **frozen `RenderedDocument`**: canonical payload + HTML snapshot + content hash (PDF + e-invoice
    payload are seams, stubbed).
- **Invoice issuance on `payment.captured`**, idempotent on `sourceEvent.eventId`.
- **Credit note on a confirmed refund** (full + partial) — invoice + line linkage + tax adjustment + PSP refund link.
- Store retains documents permanently (same rule as customer documents).

**Stub / TODO (seams only):** ES/SG/VN policies (+ `on_supply` mode, place-of-supply evidence, reduced
rates); e-invoicing **transport** (PINT-AE/PEPPOL/SII/VN); PDF generation; pro-forma (reserved);
consolidated reporting.

**Conscious trade-offs:**
- **No partial-refund product flow until the credit-note path is end-to-end** (refund → credit note
  with line/tax linkage → optional service downgrade). Until then, partial refunds are admin-only.
- HTML + canonical payload + content hash **now** (PDF/e-invoice later) — the frozen-artifact seam is
  built day one so e-invoicing doesn't force a rewrite.
- Numbering: **cancelled documents stay in the visible sequence** (auditable), never reused.

## Extending to new countries (configurable + reusable)

`@sys/billing` is a reusable `@sys/*` package — it imports nothing app-specific (boundary-gate
enforced), so any app can consume it. **Adding a country = adding an `InvoicePolicy` + config**; the
core, the document model, and the bridge never change. Register policies on the bridge:
`createBillingBridge({ policies: { AE, SG, ES } })`. What each policy owns (everything that differs):

| Aspect | UAE (v1) | Singapore (later) | Spain (later) |
|---|---|---|---|
| Regime / rate | VAT 5% | GST 9% | IVA 21% (+ reduced 10/4) |
| `billingMode` | `paid_only` | `on_supply` (tax invoice ≤30 days from time of supply) | `on_supply` |
| Numbering series | `AE-2026-…` | `SG-2026-…` | `ES-2026-…` **+ a separate corrective series** |
| `creditNoteStyle` | `referencing` | `referencing` | `rectifying` (negative/corrective invoice) |
| Disbursement | per-line evidence → out_of_scope | per-line evidence | per-line evidence |
| Render language | EN (+ AR) | EN | ES (+ EN) |
| `eInvoice` transport (mandates ~2026–27) | PINT-AE (XML, accredited providers) | PEPPOL-BIS | Facturae/UBL + platform connector |
| Rounding | per-line | per-line or per-document (consistent) | per-line |

The HTML/PDF is always the human-readable view; where a regime mandates structured e-invoicing, the
**`EInvoiceAdapter`** (injected per jurisdiction) produces the authoritative payload + transmits it —
a seam, not core logic. `creditNoteStyle` lets ES model a correction as a rectifying invoice while
UAE/SG reference the original — without changing the shared `CreditNote` type.

## Resolved decisions
1. **Gov fees — per-line by evidence, default disbursement.** `ServiceTaxMap` is a defaulting hint;
   `DisbursementEvidence` on the line is the source of truth. "Mixed" is native.
2. **B2B supported** — capture customer TRN; conditionally required on the UAE policy.
3. **Numbering** — `AE-2026-NNNNNN` + `AE-CN-2026-NNNNNN`, gapless with cancelled-in-sequence, annual reset.
4. **Home** — separate `@sys/billing` consuming `@sys/pay` events.
5. **Issuance timing** — `billingMode` policy; UAE v1 `paid_only`; `on_supply` reserved for SG/ES/VN.
6. **Pro-forma** — reserved as a non-tax artifact; not built in v1.

## Open (go-live, not blocking design)
- Per-service `ServiceTaxMap` + the disbursement-evidence capture points (accountant sign-off).
- UAE "Tax Invoice" mandatory-field list + bilingual (EN/AR) layout; the canonical payload schema +
  alignment with the UAE e-invoice mandatory fields (PINT-AE).
- Rounding confirmation (UAE per-line) and cross-border export-of-services treatment (place-of-supply).
