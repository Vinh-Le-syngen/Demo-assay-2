// Jurisdiction-policy factory. A country = a thin spec (tax config, numbering, mode, credit-note
// style, currency, tax-id kind); the shared logic (classify-by-evidence, compute, validate, render)
// lives here once. This is the "adding a country = adding a policy" promise, made concrete.

import type {
  BillingMode,
  CommercialDocument,
  CreditNote,
  DraftLine,
  FieldSpec,
  Invoice,
  InvoicePolicy,
  PolicyContext,
  RenderedDocument,
  TaxRegistration,
  TaxTreatment,
  ValidationResult,
} from '../core/contract'
import type { JurisdictionTaxConfig, NumberingConfig } from '../core/config'
import { computeTax as coreComputeTax } from '../core/tax'
import { contentHash } from '../core/document'
import { renderDocumentHtml, RENDER_VERSION } from '../render/invoice-html'

export interface JurisdictionPolicySpec {
  jurisdiction: string
  billingMode: BillingMode
  creditNoteStyle: 'referencing' | 'rectifying'
  currency: string
  tax: JurisdictionTaxConfig
  numbering: NumberingConfig
  taxId: { kind: TaxRegistration['kind']; label: string } // seller + B2B buyer tax-id kind
  /** Localized document headings (defaults to English TAX INVOICE / TAX CREDIT NOTE). */
  titles?: { invoice: string; creditNote: string }
}

// Disbursement (out_of_scope) is legitimate ONLY when the facts hold — universal across regimes;
// the rate is the jurisdiction's. Service/partner fees take the jurisdiction's standard rate.
function classify(spec: JurisdictionPolicySpec, line: DraftLine): TaxTreatment {
  let category = spec.tax.categoryTreatment[line.category]
  let reason = `${line.category} → default ${category}`

  if (line.category === 'government_fee') {
    const ev = line.disbursement
    const isDisbursement = !!ev && ev.authorizedAsAgent && ev.invoiceInCustomerName && ev.exactPassThrough && ev.separatelyItemized
    category = isDisbursement ? 'out_of_scope' : 'standard'
    reason = isDisbursement
      ? 'government fee: disbursement (agent, customer-name invoice, exact pass-through, itemized) → outside tax'
      : 'government fee: taxable reimbursement (disbursement conditions not met)'
  }

  const taxable = category === 'standard' || category === 'reduced'
  const rateKey = category === 'reduced' ? 'reduced' : 'standard'
  return {
    category,
    rate: { label: spec.tax.label, ratePct: taxable ? (spec.tax.rates[rateKey] ?? 0) : 0 },
    basis: { reason, placeOfSupply: spec.jurisdiction, disbursement: line.disbursement },
  }
}

export function createJurisdictionPolicy(spec: JurisdictionPolicySpec): InvoicePolicy {
  const titles = spec.titles ?? { invoice: 'TAX INVOICE', creditNote: 'TAX CREDIT NOTE' }

  const render = (doc: CommercialDocument, prefix: 'Invoice' | 'CreditNote'): RenderedDocument => {
    const canonical = canonicalPayload(doc)
    return {
      canonical,
      renderVersion: RENDER_VERSION,
      html: renderDocumentHtml(doc, { title: doc.kind === 'invoice' ? titles.invoice : titles.creditNote }),
      contentHash: contentHash(canonical),
      filename: `${prefix}-${doc.number}.pdf`,
    }
  }

  return {
    jurisdiction: spec.jurisdiction,
    billingMode: spec.billingMode,
    creditNoteStyle: spec.creditNoteStyle,
    classifyLine: (_ctx, line) => classify(spec, line),
    computeTax: (lines) => coreComputeTax(lines, spec.tax.rounding),

    requiredFields(ctx: PolicyContext): FieldSpec[] {
      const b2b = ctx.billingAccount.kind === 'business'
      return [
        { field: 'sellerSnapshot.taxRegistrations', required: true, label: `Seller ${spec.taxId.label}` },
        { field: 'sellerSnapshot.legalName', required: true, label: 'Seller legal name' },
        { field: 'buyerSnapshot.name', required: true, label: 'Customer name' },
        { field: 'buyerSnapshot.taxId', required: b2b, label: `Customer ${spec.taxId.label} (business)` },
        { field: 'number', required: true, label: 'Document number' },
        { field: 'issuedAt', required: true, label: 'Document date' },
        { field: 'taxBreakdown', required: true, label: `${spec.tax.label} amount + rate` },
        { field: 'grossTotal', required: true, label: `Total (${spec.currency})` },
      ]
    },

    validateDraft(ctx, doc): ValidationResult {
      const errors: Array<{ field: string; message: string }> = []
      if (!doc.sellerSnapshot.taxRegistrations.some((r) => r.kind === spec.taxId.kind)) {
        errors.push({ field: 'sellerSnapshot.taxRegistrations', message: `${spec.jurisdiction} tax invoice requires the seller ${spec.taxId.label}` })
      }
      if (!doc.buyerSnapshot.name) errors.push({ field: 'buyerSnapshot.name', message: 'customer name required' })
      if (ctx.billingAccount.kind === 'business' && !doc.buyerSnapshot.taxId) {
        errors.push({ field: 'buyerSnapshot.taxId', message: `business customer must have a ${spec.taxId.label}` })
      }
      if (doc.currency !== spec.currency) errors.push({ field: 'currency', message: `${spec.jurisdiction} documents must be in ${spec.currency}` })
      return { ok: errors.length === 0, errors }
    },

    renderInvoice: (invoice: Invoice) => render(invoice, 'Invoice'),
    renderCreditNote: (creditNote: CreditNote) => render(creditNote, 'CreditNote'),
  }
}

function canonicalPayload(doc: CommercialDocument): Record<string, unknown> {
  return {
    kind: doc.kind,
    number: doc.number,
    jurisdiction: doc.jurisdiction,
    issuedAt: doc.issuedAt,
    seller: doc.sellerSnapshot,
    buyer: doc.buyerSnapshot,
    serviceName: doc.serviceName,
    currency: doc.currency,
    lines: doc.lines.map((l) => ({ category: l.category, description: l.description, qty: l.quantity, net: l.netAmount, tax: l.tax })),
    netTotal: doc.netTotal,
    tax: doc.taxBreakdown,
    grossTotal: doc.grossTotal,
    payments: doc.paymentApplications,
  }
}
