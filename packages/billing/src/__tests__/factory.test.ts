import { describe, it, expect } from 'vitest'
import { createJurisdictionPolicy, type JurisdictionPolicySpec } from '../policies/factory'
import type {
  BillingAccount,
  CreditNote,
  DisbursementEvidence,
  DraftLine,
  Invoice,
  PolicyContext,
  SellerEntity,
} from '../core/contract'

// A spec exercising both standard and reduced categories + a localized title set.
const SPEC: JurisdictionPolicySpec = {
  jurisdiction: 'ES',
  billingMode: 'on_supply',
  creditNoteStyle: 'rectifying',
  currency: 'EUR',
  tax: {
    label: 'IVA',
    rates: { standard: 21, reduced: 10 },
    // partner_fee classified as 'reduced' so we can exercise the reduced rateKey branch.
    categoryTreatment: {
      qarar_service_fee: 'standard',
      government_fee: 'out_of_scope',
      partner_fee: 'reduced',
      discount: 'standard',
    },
    rounding: 'per_line',
  },
  numbering: { invoicePrefix: 'ES', creditNotePrefix: 'ES-RECT', annualReset: true, pad: 6 },
  taxId: { kind: 'nif', label: 'NIF' },
  titles: { invoice: 'FACTURA', creditNote: 'FACTURA RECTIFICATIVA' },
}

const policy = createJurisdictionPolicy(SPEC)

const SELLER: SellerEntity = {
  id: 'qarar-es',
  legalName: 'Qarar SL',
  country: 'ES',
  jurisdiction: 'ES',
  currency: 'EUR',
  taxRegistrations: [{ kind: 'nif', number: 'B12345678', country: 'ES' }],
  address: { line1: 'Calle Mayor 1', city: 'Madrid', country: 'ES' },
}
const B2C: BillingAccount = { id: 'a1', kind: 'individual', name: 'Ana', country: 'ES' }
const B2B: BillingAccount = { id: 'a2', kind: 'business', name: 'Acme SL', country: 'ES', taxId: { kind: 'nif', number: 'B99' } }
const ctx = (account: BillingAccount): PolicyContext => ({ sellerEntity: SELLER, billingAccount: account, now: '2026-06-03T00:00:00Z' })

const svc: DraftLine = { id: 's', category: 'qarar_service_fee', description: 'Service', quantity: 1, unitAmount: { amountMinor: 100000, currency: 'EUR' } }
const partner: DraftLine = { id: 'p', category: 'partner_fee', description: 'Partner', quantity: 1, unitAmount: { amountMinor: 50000, currency: 'EUR' } }
const fullEvidence: DisbursementEvidence = { authorizedAsAgent: true, invoiceInCustomerName: true, exactPassThrough: true, separatelyItemized: true }
const govDisbursed: DraftLine = { id: 'g1', category: 'government_fee', description: 'Gov fee', quantity: 1, unitAmount: { amountMinor: 30000, currency: 'EUR' }, disbursement: fullEvidence }

describe('factory.classify — categories and rates', () => {
  it('standard service fee carries the standard rate', () => {
    const t = policy.classifyLine(ctx(B2C), svc)
    expect(t.category).toBe('standard')
    expect(t.rate).toEqual({ label: 'IVA', ratePct: 21 })
  })

  it('reduced-category line uses the REDUCED rate, not standard (kills rateKey mutant)', () => {
    const t = policy.classifyLine(ctx(B2C), partner)
    expect(t.category).toBe('reduced')
    // rateKey must resolve to 'reduced' → 10, not the standard 21.
    expect(t.rate.ratePct).toBe(10)
    expect(t.rate.label).toBe('IVA')
  })

  it('reduced category is taxable (kills taxable-condition mutant)', () => {
    // If `category === 'reduced'` were dropped from `taxable`, ratePct would be forced to 0.
    expect(policy.classifyLine(ctx(B2C), partner).rate.ratePct).toBe(10)
  })

  it('default (non-gov) reason names the category and resolved treatment', () => {
    const t = policy.classifyLine(ctx(B2C), svc)
    expect(t.basis?.reason).toBe('qarar_service_fee → default standard')
  })

  it('government fee WITH full disbursement evidence → out_of_scope, rate 0, disbursement reason', () => {
    const t = policy.classifyLine(ctx(B2C), govDisbursed)
    expect(t.category).toBe('out_of_scope')
    expect(t.rate.ratePct).toBe(0)
    expect(t.basis?.reason).toBe(
      'government fee: disbursement (agent, customer-name invoice, exact pass-through, itemized) → outside tax',
    )
    expect(t.basis?.disbursement).toEqual(fullEvidence)
    expect(t.basis?.placeOfSupply).toBe('ES')
  })

  it('government fee WITHOUT evidence → standard, taxable, reimbursement reason', () => {
    const govNoEv: DraftLine = { ...govDisbursed, disbursement: undefined }
    const t = policy.classifyLine(ctx(B2C), govNoEv)
    expect(t.category).toBe('standard')
    expect(t.rate.ratePct).toBe(21)
    expect(t.basis?.reason).toBe('government fee: taxable reimbursement (disbursement conditions not met)')
  })

  it('government fee with PARTIAL evidence is treated as taxable, not disbursement', () => {
    // Each AND-condition matters: drop one flag → not a disbursement.
    const partial: DraftLine = { ...govDisbursed, disbursement: { ...fullEvidence, separatelyItemized: false } }
    expect(policy.classifyLine(ctx(B2C), partial).category).toBe('standard')
  })

  it('only government_fee triggers disbursement logic (kills if(true) mutant)', () => {
    // A service fee carrying disbursement evidence must NOT become out_of_scope.
    const svcWithEvidence: DraftLine = { ...svc, disbursement: fullEvidence }
    expect(policy.classifyLine(ctx(B2C), svcWithEvidence).category).toBe('standard')
  })
})

describe('factory.requiredFields', () => {
  it('B2C: buyer taxId is NOT required; all other core fields are required with exact labels', () => {
    const fields = policy.requiredFields(ctx(B2C))
    const byField = Object.fromEntries(fields.map((f) => [f.field, f]))
    expect(byField['sellerSnapshot.taxRegistrations']).toEqual({ field: 'sellerSnapshot.taxRegistrations', required: true, label: 'Seller NIF' })
    expect(byField['sellerSnapshot.legalName']).toMatchObject({ required: true, label: 'Seller legal name' })
    expect(byField['buyerSnapshot.name']).toMatchObject({ required: true, label: 'Customer name' })
    expect(byField['buyerSnapshot.taxId']).toMatchObject({ required: false, label: 'Customer NIF (business)' })
    expect(byField['number']).toMatchObject({ required: true, label: 'Document number' })
    expect(byField['issuedAt']).toMatchObject({ required: true, label: 'Document date' })
    expect(byField['taxBreakdown']).toMatchObject({ required: true, label: 'IVA amount + rate' })
    expect(byField['grossTotal']).toMatchObject({ required: true, label: 'Total (EUR)' })
    expect(fields).toHaveLength(8)
  })

  it('B2B: buyer taxId BECOMES required (kills b2b mutant)', () => {
    const fields = policy.requiredFields(ctx(B2B))
    const taxId = fields.find((f) => f.field === 'buyerSnapshot.taxId')!
    expect(taxId.required).toBe(true)
  })
})

describe('factory.validateDraft', () => {
  const baseDoc = (overrides: Partial<Invoice> = {}): Invoice => ({
    sellerSnapshot: { legalName: 'Qarar SL', country: 'ES', address: SELLER.address, taxRegistrations: SELLER.taxRegistrations },
    buyerSnapshot: { name: 'Ana', kind: 'individual', country: 'ES' },
    currency: 'EUR',
    ...overrides,
  } as unknown as Invoice)

  it('accepts a complete B2C document', () => {
    const res = policy.validateDraft(ctx(B2C), baseDoc())
    expect(res.ok).toBe(true)
    expect(res.errors).toHaveLength(0)
  })

  it('rejects a missing seller tax registration of the right kind with exact message', () => {
    const doc = baseDoc({ sellerSnapshot: { ...SELLER, taxRegistrations: [{ kind: 'vat', number: 'X', country: 'ES' }] } as never })
    const res = policy.validateDraft(ctx(B2C), doc)
    expect(res.ok).toBe(false)
    const err = res.errors.find((e) => e.field === 'sellerSnapshot.taxRegistrations')!
    expect(err.message).toBe('ES tax invoice requires the seller NIF')
  })

  it('accepts a seller whose registrations are MIXED as long as ONE matches (kills some→every)', () => {
    // One non-matching (vat) + one matching (nif). some()=true → valid; every()=false would reject.
    const doc = baseDoc({
      sellerSnapshot: {
        ...SELLER,
        taxRegistrations: [
          { kind: 'vat', number: 'X', country: 'ES' },
          { kind: 'nif', number: 'B12345678', country: 'ES' },
        ],
      } as never,
    })
    const res = policy.validateDraft(ctx(B2C), doc)
    expect(res.errors.some((e) => e.field === 'sellerSnapshot.taxRegistrations')).toBe(false)
  })

  it('rejects a missing buyer name with exact message', () => {
    const doc = baseDoc({ buyerSnapshot: { name: '', kind: 'individual', country: 'ES' } as never })
    const res = policy.validateDraft(ctx(B2C), doc)
    const err = res.errors.find((e) => e.field === 'buyerSnapshot.name')!
    expect(err.message).toBe('customer name required')
  })

  it('rejects a business buyer with no taxId', () => {
    const doc = baseDoc({ buyerSnapshot: { name: 'Acme', kind: 'business', country: 'ES' } as never })
    const res = policy.validateDraft(ctx(B2B), doc)
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => e.field === 'buyerSnapshot.taxId')).toBe(true)
  })

  it('rejects a wrong-currency document with exact message', () => {
    const doc = baseDoc({ currency: 'USD' })
    const res = policy.validateDraft(ctx(B2C), doc)
    const err = res.errors.find((e) => e.field === 'currency')!
    expect(err.message).toBe('ES documents must be in EUR')
  })
})

describe('factory.render — title, filename and metadata selection', () => {
  const invoice: Invoice = {
    id: 'd1', kind: 'invoice', number: 'ES-2026-000001', status: 'issued_paid',
    sellerEntityId: 'qarar-es',
    sellerSnapshot: { legalName: 'Qarar SL', country: 'ES', address: SELLER.address, taxRegistrations: SELLER.taxRegistrations },
    billingAccountId: 'a1',
    buyerSnapshot: { name: 'Ana', kind: 'individual', country: 'ES' },
    serviceRequestId: 'sr_abcdef12', serviceName: 'Service', currency: 'EUR',
    lines: [], netTotal: { amountMinor: 100000, currency: 'EUR' },
    taxBreakdown: { groups: [], totalTax: { amountMinor: 21000, currency: 'EUR' }, rounding: 'per_line' },
    grossTotal: { amountMinor: 121000, currency: 'EUR' },
    jurisdiction: 'ES', sourceEvent: { kind: 'payment.captured', eventId: 'e1' }, paymentApplications: [],
    issuedAt: '2026-06-03T00:00:00Z',
  }
  const creditNote: CreditNote = {
    ...invoice, id: 'd2', kind: 'credit_note', number: 'ES-RECT-2026-000001', status: 'issued',
    correctsInvoiceId: 'd1', correctsInvoiceNumber: 'ES-2026-000001', reasonCode: 'full_refund',
  }

  it('invoice render uses the localized invoice title and Invoice- filename', () => {
    const r = policy.renderInvoice(invoice)
    expect(r.html).toContain('FACTURA')
    expect(r.html).not.toContain('FACTURA RECTIFICATIVA')
    expect(r.filename).toBe('Invoice-ES-2026-000001.pdf')
    expect(r.renderVersion).toBe('qarar-invoice-html@2')
    expect(r.contentHash).toBeTruthy()
  })

  it('credit note render uses the localized credit-note title and CreditNote- filename', () => {
    const r = policy.renderCreditNote(creditNote)
    expect(r.html).toContain('FACTURA RECTIFICATIVA')
    expect(r.filename).toBe('CreditNote-ES-RECT-2026-000001.pdf')
  })

  it('content hash is deterministic for the same canonical payload', () => {
    expect(policy.renderInvoice(invoice).contentHash).toBe(policy.renderInvoice(invoice).contentHash)
  })

  it('content hash differs when a figure changes (canonical actually feeds the hash)', () => {
    const mutated: Invoice = { ...invoice, grossTotal: { amountMinor: 999999, currency: 'EUR' } }
    expect(policy.renderInvoice(mutated).contentHash).not.toBe(policy.renderInvoice(invoice).contentHash)
  })

  it('canonical line fields feed the content hash (kills lines→{} / undefined mutants)', () => {
    const lineA: Invoice = {
      ...invoice,
      lines: [{
        id: 'l1', category: 'qarar_service_fee', description: 'Alpha', quantity: 1,
        unitAmount: { amountMinor: 100000, currency: 'EUR' }, netAmount: { amountMinor: 100000, currency: 'EUR' },
        tax: { category: 'standard', rate: { label: 'IVA', ratePct: 21 } },
      }],
    }
    // Same shape but a different line description → different canonical → different hash.
    const lineB: Invoice = {
      ...lineA,
      lines: [{ ...lineA.lines[0]!, description: 'Beta' }],
    }
    const hashA = policy.renderInvoice(lineA).contentHash
    const hashB = policy.renderInvoice(lineB).contentHash
    expect(hashA).not.toBe(hashB)
    // And a line-bearing invoice differs from the empty-line one.
    expect(hashA).not.toBe(policy.renderInvoice(invoice).contentHash)
  })
})

describe('factory — default English titles when none supplied', () => {
  const enPolicy = createJurisdictionPolicy({ ...SPEC, titles: undefined })
  const invoice = {
    id: 'd', kind: 'invoice', number: 'ES-2026-000009', status: 'issued_paid',
    sellerEntityId: 'qarar-es',
    sellerSnapshot: { legalName: 'Qarar SL', country: 'ES', address: SELLER.address, taxRegistrations: SELLER.taxRegistrations },
    billingAccountId: 'a1', buyerSnapshot: { name: 'Ana', kind: 'individual', country: 'ES' },
    serviceRequestId: 'sr_abcdef12', serviceName: 'S', currency: 'EUR', lines: [],
    netTotal: { amountMinor: 1, currency: 'EUR' },
    taxBreakdown: { groups: [], totalTax: { amountMinor: 0, currency: 'EUR' }, rounding: 'per_line' as const },
    grossTotal: { amountMinor: 1, currency: 'EUR' },
    jurisdiction: 'ES', sourceEvent: { kind: 'payment.captured' as const, eventId: 'e' }, paymentApplications: [],
    issuedAt: '2026-06-03T00:00:00Z',
  } as unknown as Invoice

  it('falls back to TAX INVOICE when no titles spec is given', () => {
    expect(enPolicy.renderInvoice(invoice).html).toContain('TAX INVOICE')
  })

  it('falls back to TAX CREDIT NOTE for a credit note when no titles spec is given', () => {
    const cn = {
      ...invoice, id: 'cn', kind: 'credit_note', number: 'ES-RECT-2026-000009', status: 'issued',
      correctsInvoiceId: 'd', correctsInvoiceNumber: 'ES-2026-000009', reasonCode: 'full_refund',
    } as unknown as CreditNote
    const html = enPolicy.renderCreditNote(cn).html!
    expect(html).toContain('TAX CREDIT NOTE')
  })
})
