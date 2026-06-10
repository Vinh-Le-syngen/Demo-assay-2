import { describe, it, expect } from 'vitest'
import { createUaePolicy } from '../policies/uae'
import { createBillingBridge } from '../core/bridge'
import type { BillingAccount, BillingStore, CommercialDocument, DraftLine, Invoice, SellerEntity } from '../core/contract'

// Governance (compliance): the invoice-numbering-series and credit-note-linkage POLICIES. A tax
// authority requires a gapless, non-reused sequence and that a credit note legally references the
// invoice it corrects (number + id, with the buyer/seller frozen from the original). These assert
// the process, not incidental wiring.

const SELLER: SellerEntity = {
  id: 'qarar-ae', legalName: 'Qarar FZ-LLC', country: 'AE', jurisdiction: 'AE', currency: 'AED',
  taxRegistrations: [{ kind: 'trn', number: '100399492600003', country: 'AE' }],
  address: { line1: 'Index Tower, DIFC', city: 'Dubai', country: 'AE' },
}
const B2C: BillingAccount = { id: 'acc_1', kind: 'individual', name: 'Nha Tran', country: 'AE' }
const svc: DraftLine = { id: 'l1', category: 'qarar_service_fee', description: 'Service', quantity: 1, unitAmount: { amountMinor: 100000, currency: 'AED' } }

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
  async insertDocument(doc: CommercialDocument) { this.docs.push(doc) }
  async getInvoice(id: string) {
    return (this.docs.find((d) => d.id === id && d.kind === 'invoice') as Invoice) ?? null
  }
}

const mkBridge = (store: BillingStore) => {
  let n = 0
  return createBillingBridge({ store, policies: { AE: createUaePolicy() }, idFactory: () => `doc_${++n}` })
}

const captureAt = (eventId: string, now: string) => ({
  sellerEntity: SELLER, billingAccount: B2C, serviceRequestId: 'sr', serviceName: 'S', lines: [svc],
  sourceEvent: { kind: 'payment.captured' as const, eventId }, paymentApplications: [], now,
})

describe('governance — invoice numbering series is gapless, monotonic, per-year', () => {
  it('successive invoices increment without gaps or reuse', async () => {
    const store = new FakeStore()
    const b = mkBridge(store)
    const nums: string[] = []
    for (let i = 0; i < 4; i++) nums.push((await b.issueInvoiceFromCapture(captureAt(`e_${i}`, '2026-06-03T10:00:00Z'))).number)
    expect(nums).toEqual(['AE-2026-000001', 'AE-2026-000002', 'AE-2026-000003', 'AE-2026-000004'])
  })

  it('the sequence resets per calendar year (year is the UTC year of issuance)', async () => {
    const store = new FakeStore()
    const b = mkBridge(store)
    const a = await b.issueInvoiceFromCapture(captureAt('e_2026', '2026-12-31T20:00:00Z'))
    const c = await b.issueInvoiceFromCapture(captureAt('e_2027', '2027-01-01T08:00:00Z'))
    expect(a.number).toBe('AE-2026-000001')
    expect(c.number).toBe('AE-2027-000001') // new year → fresh series, not 000002
  })

  it('credit notes draw from a separate series (AE-CN) — invoices and credits never share numbers', async () => {
    const store = new FakeStore()
    const b = mkBridge(store)
    const inv = await b.issueInvoiceFromCapture(captureAt('e_inv', '2026-06-03T10:00:00Z'))
    const cn = await b.issueCreditNoteFromRefund({
      invoiceId: inv.id, reasonCode: 'full_refund', lines: [svc],
      sourceEvent: { kind: 'payment.refunded', eventId: 'e_cn' }, paymentApplications: [], now: '2026-06-03T11:00:00Z',
    })
    expect(inv.number).toBe('AE-2026-000001')
    expect(cn.number).toBe('AE-CN-2026-000001') // distinct prefix + own counter
    expect(cn.number).not.toBe(inv.number)
  })
})

describe('governance — credit-note linkage rules', () => {
  it('a credit note references the corrected invoice by id AND number', async () => {
    const store = new FakeStore()
    const b = mkBridge(store)
    const inv = await b.issueInvoiceFromCapture(captureAt('e_inv2', '2026-06-03T10:00:00Z'))
    const cn = await b.issueCreditNoteFromRefund({
      invoiceId: inv.id, reasonCode: 'partial_refund', reasonText: 'partial',
      lines: [svc], correctsLineIds: ['l1'],
      sourceEvent: { kind: 'payment.refunded', eventId: 'e_cn2' }, paymentApplications: [], now: '2026-06-03T11:00:00Z',
    })
    expect(cn.kind).toBe('credit_note')
    expect(cn.correctsInvoiceId).toBe(inv.id)
    expect(cn.correctsInvoiceNumber).toBe(inv.number)
    expect(cn.reasonCode).toBe('partial_refund')
    expect(cn.correctsLineIds).toEqual(['l1'])
  })

  it('the credit note freezes the original invoice\'s seller + buyer snapshots (historical fidelity)', async () => {
    const store = new FakeStore()
    const b = mkBridge(store)
    const inv = await b.issueInvoiceFromCapture(captureAt('e_inv3', '2026-06-03T10:00:00Z'))
    const cn = await b.issueCreditNoteFromRefund({
      invoiceId: inv.id, reasonCode: 'full_refund', lines: [svc],
      sourceEvent: { kind: 'payment.refunded', eventId: 'e_cn3' }, paymentApplications: [], now: '2026-06-03T11:00:00Z',
    })
    expect(cn.sellerSnapshot).toEqual(inv.sellerSnapshot)
    expect(cn.buyerSnapshot).toEqual(inv.buyerSnapshot)
    expect(cn.jurisdiction).toBe(inv.jurisdiction)
    expect(cn.status).toBe('linked_to_refund')
  })
})
