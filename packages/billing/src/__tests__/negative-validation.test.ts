import { describe, it, expect } from 'vitest'
import { createUaePolicy } from '../policies/uae'
import { createBillingBridge } from '../core/bridge'
import type { BillingAccount, BillingStore, CommercialDocument, DraftLine, Invoice, SellerEntity } from '../core/contract'

// Negative (resilience): bad drafts must be REJECTED, and an unsupported jurisdiction must throw —
// the bridge must never mint a malformed or unrouted tax document.

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
  async insertDocument(doc: CommercialDocument) {
    this.docs.push(doc)
  }
  async getInvoice(id: string) {
    return (this.docs.find((d) => d.id === id && d.kind === 'invoice') as Invoice) ?? null
  }
}

const bridge = (store: BillingStore, policies = { AE: createUaePolicy() }) => {
  let n = 0
  return createBillingBridge({ store, policies, idFactory: () => `doc_${++n}` })
}

describe('negative — bridge rejects invalid issuance', () => {
  it('rejects a business invoice issued with no customer TRN (validateDraft fails → throw, nothing stored)', async () => {
    const store = new FakeStore()
    await expect(
      bridge(store).issueInvoiceFromCapture({
        sellerEntity: SELLER,
        billingAccount: { ...B2B, taxId: undefined }, // business but no tax id
        serviceRequestId: 'sr', serviceName: 'S', lines: [svc],
        sourceEvent: { kind: 'payment.captured', eventId: 'evt_bad' }, paymentApplications: [], now: '2026-06-03T10:00:00Z',
      }),
    ).rejects.toThrow(/invoice invalid/)
    expect(store.docs).toHaveLength(0) // the bridge throws BEFORE insertDocument
  })

  it('rejects when the seller lacks the required tax registration kind', async () => {
    const store = new FakeStore()
    const noTrn: SellerEntity = { ...SELLER, taxRegistrations: [] }
    await expect(
      bridge(store).issueInvoiceFromCapture({
        sellerEntity: noTrn, billingAccount: B2C,
        serviceRequestId: 'sr', serviceName: 'S', lines: [svc],
        sourceEvent: { kind: 'payment.captured', eventId: 'evt_notrn' }, paymentApplications: [], now: '2026-06-03T10:00:00Z',
      }),
    ).rejects.toThrow(/TRN/)
    expect(store.docs).toHaveLength(0)
  })

  it('rejects an unsupported jurisdiction — no policy registered (unsupported)', async () => {
    const store = new FakeStore()
    const fr: SellerEntity = { ...SELLER, jurisdiction: 'FR', country: 'FR' }
    await expect(
      bridge(store).issueInvoiceFromCapture({
        sellerEntity: fr, billingAccount: B2C,
        serviceRequestId: 'sr', serviceName: 'S', lines: [svc],
        sourceEvent: { kind: 'payment.captured', eventId: 'evt_fr' }, paymentApplications: [], now: '2026-06-03T10:00:00Z',
      }),
    ).rejects.toThrow(/no policy for jurisdiction "FR"/)
    expect(store.docs).toHaveLength(0)
  })

  it('rejects a credit note against an unknown invoice id', async () => {
    const store = new FakeStore()
    await expect(
      bridge(store).issueCreditNoteFromRefund({
        invoiceId: 'does-not-exist', reasonCode: 'full_refund', lines: [svc],
        sourceEvent: { kind: 'payment.refunded', eventId: 'evt_cn_orphan' }, paymentApplications: [], now: '2026-06-03T10:00:00Z',
      }),
    ).rejects.toThrow(/unknown invoice "does-not-exist"/)
    expect(store.docs).toHaveLength(0)
  })
})

describe('negative — policy.validateDraft surfaces every missing field', () => {
  const policy = createUaePolicy()
  it('reports a currency mismatch as a distinct error (not silently accepted)', () => {
    const ctx = { sellerEntity: SELLER, billingAccount: B2C, now: '2026-06-03T00:00:00Z' }
    const doc = {
      sellerSnapshot: { ...SELLER }, buyerSnapshot: { name: 'Nha Tran', kind: 'individual', country: 'AE' },
      currency: 'USD', // wrong currency for an AE document
    } as unknown as Invoice
    const res = policy.validateDraft(ctx, doc)
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => e.field === 'currency')).toBe(true)
  })

  it('flags a missing customer name', () => {
    const ctx = { sellerEntity: SELLER, billingAccount: B2C, now: '2026-06-03T00:00:00Z' }
    const doc = {
      sellerSnapshot: { ...SELLER }, buyerSnapshot: { name: '', kind: 'individual', country: 'AE' }, currency: 'AED',
    } as unknown as Invoice
    const res = policy.validateDraft(ctx, doc)
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => e.field === 'buyerSnapshot.name')).toBe(true)
  })
})
