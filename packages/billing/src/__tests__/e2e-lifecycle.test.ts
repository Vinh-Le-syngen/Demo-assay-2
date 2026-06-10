import { describe, it, expect } from 'vitest'
import { createUaePolicy } from '../policies/uae'
import { createBillingBridge } from '../core/bridge'
import { renderDocumentHtml } from '../render/invoice-html'
import type {
  BillingAccount,
  BillingStore,
  CommercialDocument,
  DraftLine,
  Invoice,
  InvoicePolicy,
  PaymentApplication,
  SellerEntity,
  SourceEvent,
} from '../core/contract'

// e2e (happy path) — the issuance half of the commercial-document lifecycle driven the way the host
// actually drives it: a payment provider's webhook event arrives, the bridge classifies + numbers +
// taxes + renders a legal invoice. This traverses the chain in one flow (event → policy classify →
// issue → render) and is distinct from the intra-system integration tests, which exercise a single
// step in isolation (billing.test = one invoice; governance = the numbering/linkage rule). The
// refund/credit-note recovery half lives in e2e-refund-recovery.test.ts.

// ── The host's commercial entity + customer (B2C UAE) ────────────────────────────────────────
const SELLER: SellerEntity = {
  id: 'qarar-ae',
  legalName: 'Qarar FZ-LLC',
  country: 'AE',
  jurisdiction: 'AE',
  currency: 'AED',
  taxRegistrations: [{ kind: 'trn', number: '100399492600003', country: 'AE' }],
  address: { line1: 'Index Tower, DIFC', city: 'Dubai', country: 'AE' },
  branding: { logoText: 'Qarar', footer: 'Qarar FZ-LLC · DIFC, Dubai' },
}
const CUSTOMER: BillingAccount = { id: 'acc_nha', kind: 'individual', name: 'Nha Tran', email: 'nha@example.ae', country: 'AE' }

// A real order: priced service fee + coordination fee + a government fee passed through as a true
// disbursement (outside VAT). The bridge must tax only the first two.
const ORDER_LINES: DraftLine[] = [
  { id: 'l1', category: 'qarar_service_fee', description: 'Company Formation — Mainland LLC', quantity: 1, unitAmount: { amountMinor: 650000, currency: 'AED' } },
  { id: 'l2', category: 'qarar_service_fee', description: 'Document handling & coordination', quantity: 1, unitAmount: { amountMinor: 150000, currency: 'AED' } },
  { id: 'l3', category: 'government_fee', description: 'DED trade licence fee', quantity: 1, unitAmount: { amountMinor: 1200000, currency: 'AED' },
    disbursement: { authorizedAsAgent: true, invoiceInCustomerName: true, exactPassThrough: true, separatelyItemized: true } },
]

// ── The injected store (Data plane): the SAME FakeStore the existing suite uses — atomic per-year,
//    per-kind numbering, idempotency on the source event, and credit-note → invoice lookup. ──────
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

// What the host wires once at boot.
const wire = () => {
  const store = new FakeStore()
  let n = 0
  const policy: InvoicePolicy = createUaePolicy()
  const bridge = createBillingBridge({ store, policies: { AE: policy }, idFactory: () => `doc_${++n}` })
  return { store, policy, bridge }
}

// The shapes a Stripe webhook handler hands the bridge.
const captureEvent: SourceEvent = { kind: 'payment.captured', eventId: 'evt_capture_e2e', paymentIntentId: 'pi_e2e', providerRef: 'ch_e2e' }
const chargeApplied: PaymentApplication = {
  kind: 'charge', provider: 'stripe', providerRef: 'pi_e2e', paymentIntentId: 'pi_e2e',
  amount: { amountMinor: 2040000, currency: 'AED' }, appliedAt: '2026-06-03T10:00:00Z',
}

describe('e2e — commercial-document lifecycle (path: happy)', () => {
  it('payment.captured webhook → classify → issue (numbered+taxed) → render a legal tax invoice, all in one traversal', async () => {
    const { store, policy, bridge } = wire()

    // 1) The webhook arrives and the host hands the captured payment to the bridge.
    const invoice = await bridge.issueInvoiceFromCapture({
      sellerEntity: SELLER,
      billingAccount: CUSTOMER,
      serviceRequestId: 'sr_123456',
      serviceName: 'Company Formation — Mainland LLC',
      lines: ORDER_LINES,
      sourceEvent: captureEvent,
      paymentApplications: [chargeApplied],
      now: '2026-06-03T10:00:00Z',
    })

    // 2) It was persisted with a reserved series number and the paid status.
    expect(store.docs).toHaveLength(1)
    expect(invoice.kind).toBe('invoice')
    expect(invoice.status).toBe('issued_paid')
    expect(invoice.number).toBe('AE-2026-000001')

    // 3) Tax was actually COMPUTED, not echoed: VAT 5% on the 8,000 AED service fees only; the
    //    disbursed government fee is out_of_scope. net 20,000 → tax 400 → gross 20,400 AED.
    expect(invoice.netTotal.amountMinor).toBe(2000000)
    expect(invoice.taxBreakdown.totalTax.amountMinor).toBe(40000)
    expect(invoice.grossTotal.amountMinor).toBe(2040000)
    const outOfScope = invoice.lines.find((l) => l.id === 'l3')!
    expect(outOfScope.tax.category).toBe('out_of_scope')

    // 4) The frozen snapshots are the legal record (not a live join).
    expect(invoice.sellerSnapshot.taxRegistrations[0]!.number).toBe('100399492600003')
    expect(invoice.buyerSnapshot.name).toBe('Nha Tran')
    expect(invoice.sourceEvent.eventId).toBe('evt_capture_e2e')

    // 5) The host renders the human-readable document from the issued invoice. The rendered HTML
    //    carries the real computed figures + the regulatory fields a tax invoice must show.
    const rendered = policy.renderInvoice(invoice)
    expect(rendered.html).toBe(renderDocumentHtml(invoice)) // policy render == canonical renderer
    const html = rendered.html!
    expect(html).toContain('TAX INVOICE')
    expect(html).toContain('AE-2026-000001') // the reserved number on the page
    expect(html).toContain('100399492600003') // seller TRN
    expect(html).toContain('Nha Tran') // buyer
    expect(html).toContain('VAT 5%') // tax label + rate
    expect(html).toContain('20,000.00') // computed net
    expect(html).toContain('20,400.00') // computed gross (VAT added)
    expect(html).toContain('Outside tax scope') // the disbursed gov fee
    expect(html).toContain('Paid') // the captured charge is reflected
    expect(html).not.toContain('21,000.00') // would mean VAT charged on the gov fee — must NOT
    // tamper-evidence travels with the document
    expect(rendered.contentHash).toMatch(/^fnv1a_[0-9a-f]{8}$/)
    expect(rendered.filename).toBe('Invoice-AE-2026-000001.pdf')
  })
})
