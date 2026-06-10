import { describe, it, expect } from 'vitest'
import { createUaePolicy } from '../policies/uae'
import { createBillingBridge } from '../core/bridge'
import type { BillingAccount, BillingStore, CommercialDocument, DraftLine, Invoice, SellerEntity } from '../core/contract'

const SELLER: SellerEntity = {
  id: 'qarar-ae',
  legalName: 'Qarar FZ-LLC',
  country: 'AE',
  jurisdiction: 'AE',
  currency: 'AED',
  taxRegistrations: [{ kind: 'trn', number: '100399492600003', country: 'AE' }],
  address: { line1: 'Index Tower, DIFC', city: 'Dubai', country: 'AE' },
}
const B2C: BillingAccount = { id: 'acc_1', kind: 'individual', name: 'Nha Tran', country: 'AE' }
const B2B: BillingAccount = { id: 'acc_2', kind: 'business', name: 'Acme DMCC', country: 'AE', taxId: { kind: 'trn', number: '100111122233344' } }

const LINES: DraftLine[] = [
  { id: 'l1', category: 'qarar_service_fee', description: 'Company Formation — Mainland LLC', quantity: 1, unitAmount: { amountMinor: 650000, currency: 'AED' } },
  { id: 'l2', category: 'qarar_service_fee', description: 'Document handling & coordination', quantity: 1, unitAmount: { amountMinor: 150000, currency: 'AED' } },
  // a government fee passed through as a true disbursement → outside VAT
  { id: 'l3', category: 'government_fee', description: 'DED trade licence fee', quantity: 1, unitAmount: { amountMinor: 1200000, currency: 'AED' },
    disbursement: { authorizedAsAgent: true, invoiceInCustomerName: true, exactPassThrough: true, separatelyItemized: true } },
]

class FakeStore implements BillingStore {
  docs: CommercialDocument[] = []
  private seq: Record<string, number> = {}
  async findDocumentBySourceEvent(eventId: string) {
    return this.docs.find((d) => d.sourceEvent.eventId === eventId) ?? null
  }
  async reserveNumber(sellerEntityId: string, year: number, kind: 'invoice' | 'credit_note') {
    const key = `${sellerEntityId}|${year}|${kind}`
    this.seq[key] = (this.seq[key] ?? 0) + 1
    const prefix = kind === 'invoice' ? 'AE' : 'AE-CN'
    return `${prefix}-${year}-${String(this.seq[key]).padStart(6, '0')}`
  }
  async insertDocument(doc: CommercialDocument) {
    this.docs.push(doc)
  }
  async getInvoice(id: string) {
    return (this.docs.find((d) => d.id === id && d.kind === 'invoice') as Invoice) ?? null
  }
}

const bridge = (store: BillingStore) => {
  let n = 0
  return createBillingBridge({ store, policies: { AE: createUaePolicy() }, idFactory: () => `doc_${++n}` })
}

describe('UAE policy — tax classification', () => {
  const policy = createUaePolicy()
  const ctx = { sellerEntity: SELLER, billingAccount: B2C, now: '2026-06-03T00:00:00Z' }

  it('standard-rates the service fee at 5%', () => {
    expect(policy.classifyLine(ctx, LINES[0]!)).toMatchObject({ category: 'standard', rate: { label: 'VAT', ratePct: 5 } })
  })
  it('treats a gov fee with full disbursement evidence as out_of_scope', () => {
    expect(policy.classifyLine(ctx, LINES[2]!).category).toBe('out_of_scope')
  })
  it('treats a gov fee WITHOUT evidence as taxable reimbursement', () => {
    const noEv: DraftLine = { ...LINES[2]!, disbursement: undefined }
    expect(policy.classifyLine(ctx, noEv).category).toBe('standard')
  })
})

describe('UAE policy — validation', () => {
  const policy = createUaePolicy()
  it('rejects a business invoice with no customer TRN', () => {
    const ctx = { sellerEntity: SELLER, billingAccount: { ...B2B, taxId: undefined }, now: '2026-06-03T00:00:00Z' }
    const doc = { sellerSnapshot: { ...SELLER }, buyerSnapshot: { name: 'Acme', kind: 'business', country: 'AE' }, currency: 'AED' } as unknown as Invoice
    expect(policy.validateDraft(ctx, doc).ok).toBe(false)
  })
})

describe('billing bridge — issue invoice', () => {
  it('issues a paid invoice: VAT only on the service fees, gov fee outside scope', async () => {
    const store = new FakeStore()
    const inv = await bridge(store).issueInvoiceFromCapture({
      sellerEntity: SELLER, billingAccount: B2C, serviceRequestId: 'sr_123456', serviceName: 'Company Formation — Mainland LLC',
      lines: LINES, sourceEvent: { kind: 'payment.captured', eventId: 'evt_1', paymentIntentId: 'pi_1' },
      paymentApplications: [{ kind: 'charge', provider: 'stripe', providerRef: 'pi_1', paymentIntentId: 'pi_1', amount: { amountMinor: 2840000, currency: 'AED' }, appliedAt: '2026-06-03T10:00:00Z' }],
      now: '2026-06-03T10:00:00Z',
    })
    expect(inv.number).toBe('AE-2026-000001')
    expect(inv.status).toBe('issued_paid')
    expect(inv.netTotal.amountMinor).toBe(2000000) // 6500 + 1500 service + ... wait gov fee is net too
    // net = 6500 + 1500 + 12000 = 20000 AED → 2,000,000 minor
    // VAT = 5% on 8000 (service only) = 400 AED → 40000 minor; gov fee out_of_scope
    expect(inv.taxBreakdown.totalTax.amountMinor).toBe(40000)
    expect(inv.grossTotal.amountMinor).toBe(2040000) // 20400 AED
  })

  it('is idempotent on the source event id', async () => {
    const store = new FakeStore()
    const b = bridge(store)
    const a = await b.issueInvoiceFromCapture({ sellerEntity: SELLER, billingAccount: B2C, serviceRequestId: 'sr_1', serviceName: 'X', lines: LINES, sourceEvent: { kind: 'payment.captured', eventId: 'evt_dup' }, paymentApplications: [], now: '2026-06-03T10:00:00Z' })
    const again = await b.issueInvoiceFromCapture({ sellerEntity: SELLER, billingAccount: B2C, serviceRequestId: 'sr_1', serviceName: 'X', lines: LINES, sourceEvent: { kind: 'payment.captured', eventId: 'evt_dup' }, paymentApplications: [], now: '2026-06-03T10:00:00Z' })
    expect(again.number).toBe(a.number)
    expect(store.docs).toHaveLength(1)
  })

  it('renders the real computed figures (not just labels) onto the invoice', async () => {
    const store = new FakeStore()
    const inv = await bridge(store).issueInvoiceFromCapture({
      sellerEntity: SELLER, billingAccount: B2C, serviceRequestId: 'sr_x', serviceName: 'Company Formation — Mainland LLC',
      lines: LINES, sourceEvent: { kind: 'payment.captured', eventId: 'evt_render', paymentIntentId: 'pi_1' },
      paymentApplications: [], now: '2026-06-03T10:00:00Z',
    })
    const html = createUaePolicy().renderInvoice(inv).html!
    // net 6500+1500+12000 = 20000 AED; VAT 5% only on the 8000 service fees = 400; gov fee outside scope.
    // (assert numeric values, not the currency string — Intl uses a non-breaking space after 'AED'.)
    expect(html).toContain('100399492600003') // seller TRN must appear
    expect(html).toContain('Nha Tran') // buyer snapshot
    expect(html).toContain('VAT 5%') // tax label + rate
    expect(html).toContain('20,000.00') // COMPUTED net total
    expect(html).toContain('20,400.00') // COMPUTED gross = net + VAT (so VAT WAS added)
    expect(html).toContain('Outside tax scope') // the disbursed gov fee, rendered as out-of-scope
    // guard: a renderer that printed net-as-gross (no VAT) or VAT on the gov fee would show these
    expect(html).not.toContain('21,000.00') // net + VAT-on-everything (would mean VAT charged on the gov fee)
  })
})
