import { describe, it, expect } from 'vitest'
import { createUaePolicy } from '../policies/uae'
import { createBillingBridge } from '../core/bridge'
import { formatDocumentNumber } from '../core/document'
import type { BillingAccount, BillingStore, CommercialDocument, DraftLine, Invoice, SellerEntity } from '../core/contract'

// Adversarial (resilience): protocol-misuse / resource-abuse of the issuance seam. A hostile or
// buggy caller replaying webhooks must not be able to mint duplicate tax documents or burn the
// numbering series — idempotency on the source-event id is the defence, and numbers must stay
// monotonic and never collide.

const SELLER: SellerEntity = {
  id: 'qarar-ae', legalName: 'Qarar FZ-LLC', country: 'AE', jurisdiction: 'AE', currency: 'AED',
  taxRegistrations: [{ kind: 'trn', number: '100399492600003', country: 'AE' }],
  address: { line1: 'Index Tower, DIFC', city: 'Dubai', country: 'AE' },
}
const B2C: BillingAccount = { id: 'acc_1', kind: 'individual', name: 'Nha Tran', country: 'AE' }
const svc: DraftLine = { id: 'l1', category: 'qarar_service_fee', description: 'Service', quantity: 1, unitAmount: { amountMinor: 100000, currency: 'AED' } }

class FakeStore implements BillingStore {
  docs: CommercialDocument[] = []
  reserveCalls = 0
  private seq: Record<string, number> = {}
  async findDocumentBySourceEvent(eventId: string) {
    return this.docs.find((d) => d.sourceEvent.eventId === eventId) ?? null
  }
  async reserveNumber(sellerEntityId: string, year: number, kind: 'invoice' | 'credit_note') {
    this.reserveCalls++
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

const bridge = (store: BillingStore) => {
  let n = 0
  return createBillingBridge({ store, policies: { AE: createUaePolicy() }, idFactory: () => `doc_${++n}` })
}

const capture = (eventId: string) => ({
  sellerEntity: SELLER, billingAccount: B2C, serviceRequestId: 'sr', serviceName: 'S', lines: [svc],
  sourceEvent: { kind: 'payment.captured' as const, eventId }, paymentApplications: [], now: '2026-06-03T10:00:00Z',
})

describe('adversarial — replay abuse cannot mint duplicates or burn numbers', () => {
  it('a webhook replayed many times yields ONE invoice and reserves a number exactly once', async () => {
    const store = new FakeStore()
    const b = bridge(store)
    const results: Invoice[] = []
    for (let i = 0; i < 25; i++) results.push(await b.issueInvoiceFromCapture(capture('evt_replay')))
    expect(store.docs).toHaveLength(1) // no duplicate documents
    expect(store.reserveCalls).toBe(1) // numbering series not burned by replays
    expect(new Set(results.map((r) => r.number)).size).toBe(1)
  })

  it('distinct source events get distinct, strictly increasing numbers (no collision)', async () => {
    const store = new FakeStore()
    const b = bridge(store)
    const nums: string[] = []
    for (let i = 0; i < 5; i++) nums.push((await b.issueInvoiceFromCapture(capture(`evt_${i}`))).number)
    expect(new Set(nums).size).toBe(5) // all unique
    const seqs = nums.map((n) => Number(n.split('-')[2]))
    expect(seqs).toEqual([1, 2, 3, 4, 5]) // monotonic, no reuse
  })
})

describe('adversarial — numbering format is overflow/abuse resistant', () => {
  it('formatDocumentNumber pads small sequences and does not truncate large ones', () => {
    expect(formatDocumentNumber('AE', 2026, 1)).toBe('AE-2026-000001')
    // a sequence wider than the pad must NOT be silently truncated to 6 digits.
    expect(formatDocumentNumber('AE', 2026, 1234567)).toBe('AE-2026-1234567')
  })

  it('a zero/negative sequence still formats deterministically (no exception, no NaN)', () => {
    expect(formatDocumentNumber('AE', 2026, 0)).toBe('AE-2026-000000')
    expect(formatDocumentNumber('AE', 2026, -1)).toBe('AE-2026-0000-1')
  })
})
