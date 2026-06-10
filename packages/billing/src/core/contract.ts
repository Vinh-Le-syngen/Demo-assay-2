// @sys/billing — Control/Governance contract. Types only. The legal commercial-document model:
// invoices + credit notes issued from policy-governed payment events. See docs/sys-billing-design.md.

export interface Money { amountMinor: number; currency: string } // minor units + ISO-4217

export type BillingMode = 'paid_only' | 'on_supply' | 'hybrid'

// ── Parties ──────────────────────────────────────────────────────────────────────
export interface PostalAddress { line1: string; line2?: string; city: string; region?: string; postalCode?: string; country: string }
export interface TaxRegistration { kind: 'trn' | 'vat' | 'gst' | 'nif' | 'mst'; number: string; country: string }

export interface SellerEntity {
  id: string
  legalName: string
  country: string
  jurisdiction: string
  taxRegistrations: TaxRegistration[]
  address: PostalAddress
  currency: string
  branding?: DocumentBranding
}

/** Injected brand — the package hardcodes NO colors. Host passes its design tokens. */
export interface InvoiceTheme {
  primary: string // headings, totals, wordmark
  accent: string // rule, superscript, highlights
  text: string
  muted: string
  faint: string
  border: string
  soft: string // soft surface (the payment box)
  paidBg: string
  paidFg: string
  creditBg: string
  creditFg: string
}
export interface DocumentBranding {
  logoText?: string
  footer?: string
  theme?: Partial<InvoiceTheme>
}
export interface BillingAccount {
  id: string
  kind: 'individual' | 'business'
  name: string
  email?: string
  taxId?: { kind: string; number: string }
  address?: PostalAddress
  country: string
}

// Frozen snapshots onto the document — historical record, not a live view.
export interface PartySnapshot {
  name: string
  kind: 'individual' | 'business'
  country: string
  address?: PostalAddress
  taxId?: { kind: string; number: string }
}
export interface SellerSnapshot {
  legalName: string
  country: string
  address: PostalAddress
  taxRegistrations: TaxRegistration[]
  branding?: DocumentBranding
}

// ── Tax: classification / rate / basis are separate ──────────────────────────────
export type TaxCategory = 'standard' | 'reduced' | 'zero_rated' | 'exempt' | 'out_of_scope' | 'reverse_charge'
export interface TaxRateSnapshot { label: string; ratePct: number }
export interface DisbursementEvidence {
  authorizedAsAgent: boolean
  invoiceInCustomerName: boolean
  exactPassThrough: boolean
  separatelyItemized: boolean
}
export interface TaxBasisEvidence { reason: string; placeOfSupply?: string; disbursement?: DisbursementEvidence }
export interface TaxTreatment { category: TaxCategory; rate: TaxRateSnapshot; basis?: TaxBasisEvidence }

// ── Line items ───────────────────────────────────────────────────────────────────
export type LineCategory = 'qarar_service_fee' | 'government_fee' | 'partner_fee' | 'discount'
export interface InvoiceLine {
  id: string
  category: LineCategory
  description: string
  quantity: number
  unitAmount: Money
  netAmount: Money
  tax: TaxTreatment
  metadata?: Record<string, unknown>
}
export interface TaxBreakdown {
  groups: Array<{ category: TaxCategory; label: string; ratePct: number; taxableBase: Money; taxAmount: Money }>
  totalTax: Money
  rounding: 'per_line' | 'per_document'
}

// ── Source event (idempotency + provenance) ──────────────────────────────────────
export interface SourceEvent {
  kind: 'payment.captured' | 'payment.refunded' | 'admin.correction'
  eventId: string
  paymentIntentId?: string
  providerRef?: string
}

// ── Documents ────────────────────────────────────────────────────────────────────
export type DocumentKind = 'invoice' | 'credit_note'
export type InvoiceStatus = 'number_reserved' | 'issued_paid' | 'cancelled'
export type CreditNoteStatus = 'number_reserved' | 'issued' | 'linked_to_refund' | 'cancelled'
export type CreditNoteReason = 'full_refund' | 'partial_refund' | 'price_reduction' | 'goodwill' | 'tax_correction' | 'overcharge'

export interface PaymentApplication {
  kind: 'charge' | 'refund'
  provider: string
  providerRef: string
  paymentIntentId: string
  amount: Money
  appliedAt: string
}

export interface RenderedDocument {
  canonical: Record<string, unknown>
  renderVersion: string
  html?: string
  pdf?: { storageRef: string }
  contentHash: string
  eInvoice?: { format: string; payload: Record<string, unknown> }
  filename: string
}

export interface CommercialDocumentBase {
  id: string
  kind: DocumentKind
  number: string
  sellerEntityId: string
  sellerSnapshot: SellerSnapshot
  billingAccountId: string
  buyerSnapshot: PartySnapshot
  serviceRequestId: string
  serviceName: string
  currency: string
  lines: InvoiceLine[]
  netTotal: Money
  taxBreakdown: TaxBreakdown
  grossTotal: Money
  jurisdiction: string
  sourceEvent: SourceEvent
  paymentApplications: PaymentApplication[]
  issuedAt?: string
  cancelledAt?: string
  metadata?: Record<string, unknown>
}
export interface Invoice extends CommercialDocumentBase { kind: 'invoice'; status: InvoiceStatus }
export interface CreditNote extends CommercialDocumentBase {
  kind: 'credit_note'
  status: CreditNoteStatus
  correctsInvoiceId: string
  correctsInvoiceNumber: string
  correctsLineIds?: string[]
  reasonCode: CreditNoteReason
  reasonText?: string
}
export type CommercialDocument = Invoice | CreditNote

// ── E-invoice transport seam (Data) — structured payload + platform connector, per jurisdiction.
//    Injected/optional: UAE PINT-AE, SG/EU PEPPOL-BIS, ES Facturae/UBL. The HTML/PDF is the
//    human-readable view; this is the authoritative structured payload where mandated.
export type EInvoiceFormat = 'pint-ae' | 'peppol-bis' | 'facturae' | 'ubl' | 'none'
export interface EInvoiceAdapter {
  format: EInvoiceFormat
  build(doc: CommercialDocument): { format: EInvoiceFormat; payload: Record<string, unknown> }
  transmit?(built: { format: EInvoiceFormat; payload: Record<string, unknown> }): Promise<{ ref: string }>
}

// ── Per-jurisdiction policy (Governance) ─────────────────────────────────────────
export interface PolicyContext { sellerEntity: SellerEntity; billingAccount: BillingAccount; now: string }
export interface ValidationResult { ok: boolean; errors: Array<{ field: string; message: string }> }
export interface FieldSpec { field: string; required: boolean; label: string }

export interface InvoicePolicy {
  jurisdiction: string
  billingMode: BillingMode
  /** ES treats a credit note as a rectifying invoice; UAE/SG as a referencing credit note. */
  creditNoteStyle: 'referencing' | 'rectifying'
  classifyLine(ctx: PolicyContext, line: DraftLine): TaxTreatment
  computeTax(lines: InvoiceLine[]): TaxBreakdown
  requiredFields(ctx: PolicyContext): FieldSpec[]
  validateDraft(ctx: PolicyContext, doc: CommercialDocument): ValidationResult
  renderInvoice(invoice: Invoice): RenderedDocument
  renderCreditNote(creditNote: CreditNote): RenderedDocument
  /** Optional structured e-invoice transport (PINT-AE/PEPPOL/Facturae) — added per jurisdiction. */
  eInvoice?: EInvoiceAdapter
}

// A line as supplied by the caller (no tax yet — the policy classifies it).
export interface DraftLine {
  id: string
  category: LineCategory
  description: string
  quantity: number
  unitAmount: Money
  disbursement?: DisbursementEvidence
  metadata?: Record<string, unknown>
}

// ── Injected store (Data) — atomic number reservation; cancelled shells stay in sequence ─
export interface BillingStore {
  findDocumentBySourceEvent(eventId: string): Promise<CommercialDocument | null>
  reserveNumber(sellerEntityId: string, year: number, kind: DocumentKind): Promise<string>
  insertDocument(doc: CommercialDocument): Promise<void>
  getInvoice(id: string): Promise<Invoice | null>
}
