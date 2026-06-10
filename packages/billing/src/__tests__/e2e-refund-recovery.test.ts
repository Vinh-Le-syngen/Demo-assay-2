import { describe, it, expect } from 'vitest'
import { createUaePolicy } from '../policies/uae'
import { createBillingBridge } from '../core/bridge'
import type {
  BillingAccount,
  BillingStore,
  CommercialDocument,
  CreditNote,
  DraftLine,
  Invoice,
  InvoicePolicy,
  PaymentApplication,
  SellerEntity,
  SourceEvent,
} from '../core/contract'

// e2e (recovery path) — the refund half of the commercial-document lifecycle. After a sale has been
// invoiced, a refund webhook arrives and the host mints a credit note that legally references and
// reverses the original invoice, then renders it. This traverses event → issue → refund → credit
// note → render, and is the recovery counterpart to e2e-lifecycle.test.ts (the happy issuance path).

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

describe('e2e — refund lifecycle (path: recovery)', () => {
  it('captured invoice → payment.refunded webhook → credit note that references + reverses it, rendered', async () => {
    const { store, policy, bridge } = wire()

    // 1) The original sale: invoice issued from a capture.
    const invoice = await bridge.issueInvoiceFromCapture({
      sellerEntity: SELLER,
      billingAccount: CUSTOMER,
      serviceRequestId: 'sr_refundable',
      serviceName: 'Company Formation — Mainland LLC',
      lines: ORDER_LINES,
      sourceEvent: captureEvent,
      paymentApplications: [chargeApplied],
      now: '2026-06-03T10:00:00Z',
    })

    // 2) A refund webhook arrives later. The host issues a full credit note for the same lines.
    const refundEvent: SourceEvent = { kind: 'payment.refunded', eventId: 'evt_refund_e2e', paymentIntentId: 'pi_e2e', providerRef: 're_e2e' }
    const refundApplied: PaymentApplication = {
      kind: 'refund', provider: 'stripe', providerRef: 're_e2e', paymentIntentId: 'pi_e2e',
      amount: { amountMinor: 2040000, currency: 'AED' }, appliedAt: '2026-06-04T09:00:00Z',
    }
    const creditNote = (await bridge.issueCreditNoteFromRefund({
      invoiceId: invoice.id,
      reasonCode: 'full_refund',
      reasonText: 'customer cancelled before filing',
      lines: ORDER_LINES,
      sourceEvent: refundEvent,
      paymentApplications: [refundApplied],
      now: '2026-06-04T09:00:00Z',
    })) as CreditNote

    // 3) Both documents now exist; the credit note draws from its own (AE-CN) series.
    expect(store.docs).toHaveLength(2)
    expect(creditNote.kind).toBe('credit_note')
    expect(creditNote.status).toBe('linked_to_refund')
    expect(creditNote.number).toBe('AE-CN-2026-000001')

    // 4) It legally references the corrected invoice by id AND number, with the original snapshots
    //    frozen onto it (historical fidelity across the lifecycle).
    expect(creditNote.correctsInvoiceId).toBe(invoice.id)
    expect(creditNote.correctsInvoiceNumber).toBe('AE-2026-000001')
    expect(creditNote.reasonCode).toBe('full_refund')
    expect(creditNote.sellerSnapshot).toEqual(invoice.sellerSnapshot)
    expect(creditNote.buyerSnapshot).toEqual(invoice.buyerSnapshot)

    // 5) It REVERSES the same money the invoice charged — net/tax/gross mirror the original.
    expect(creditNote.netTotal.amountMinor).toBe(invoice.netTotal.amountMinor)
    expect(creditNote.taxBreakdown.totalTax.amountMinor).toBe(invoice.taxBreakdown.totalTax.amountMinor)
    expect(creditNote.grossTotal.amountMinor).toBe(invoice.grossTotal.amountMinor)

    // 6) The rendered credit note is a distinct legal artefact pointing back at the invoice.
    const html = policy.renderCreditNote(creditNote).html!
    expect(html).toContain('TAX CREDIT NOTE')
    expect(html).toContain('AE-CN-2026-000001') // the credit note's own number
    expect(html).toContain('Against AE-2026-000001') // the reference back to the invoice
    expect(html).toContain('full refund') // the reason, rendered
    expect(html).toContain('Refunded') // the refund payment application reflected
    expect(html).toContain('stripe')

    // 7) The whole flow stays idempotent: replaying the refund webhook does NOT mint a second note.
    const replay = await bridge.issueCreditNoteFromRefund({
      invoiceId: invoice.id,
      reasonCode: 'full_refund',
      lines: ORDER_LINES,
      sourceEvent: refundEvent,
      paymentApplications: [refundApplied],
      now: '2026-06-04T09:00:00Z',
    })
    expect(replay.number).toBe(creditNote.number)
    expect(store.docs).toHaveLength(2)
  })
})
