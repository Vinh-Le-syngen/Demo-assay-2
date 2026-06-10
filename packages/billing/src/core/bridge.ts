// @sys/billing — the bridge. Orchestration only (Control). Turns a confirmed payment event into
// an immutable Invoice, and a confirmed refund into a CreditNote. Policy + store are injected.

import type {
  BillingAccount,
  BillingStore,
  CreditNote,
  CreditNoteReason,
  DraftLine,
  Invoice,
  InvoiceLine,
  InvoicePolicy,
  PartySnapshot,
  PaymentApplication,
  SellerEntity,
  SellerSnapshot,
  SourceEvent,
} from './contract'
import { documentTotals } from './document'

export interface IssueInvoiceInput {
  sellerEntity: SellerEntity
  billingAccount: BillingAccount
  serviceRequestId: string
  serviceName: string
  lines: DraftLine[]
  sourceEvent: SourceEvent
  paymentApplications: PaymentApplication[]
  now: string
}

export interface IssueCreditNoteInput {
  invoiceId: string
  reasonCode: CreditNoteReason
  reasonText?: string
  lines: DraftLine[] // the credited lines (usually a subset, negative-able)
  correctsLineIds?: string[]
  sourceEvent: SourceEvent
  paymentApplications: PaymentApplication[]
  now: string
}

export interface BillingBridge {
  issueInvoiceFromCapture(input: IssueInvoiceInput): Promise<Invoice>
  issueCreditNoteFromRefund(input: IssueCreditNoteInput): Promise<CreditNote>
}

const sellerSnapshot = (e: SellerEntity): SellerSnapshot => ({
  legalName: e.legalName,
  country: e.country,
  address: e.address,
  taxRegistrations: e.taxRegistrations,
  branding: e.branding,
})
const buyerSnapshot = (a: BillingAccount): PartySnapshot => ({
  name: a.name,
  kind: a.kind,
  country: a.country,
  address: a.address,
  taxId: a.taxId,
})

export function createBillingBridge(deps: {
  store: BillingStore
  policies: Record<string, InvoicePolicy>
  idFactory: () => string
}): BillingBridge {
  const { store, policies, idFactory } = deps

  const policyFor = (jurisdiction: string): InvoicePolicy => {
    const p = policies[jurisdiction]
    if (!p) throw new Error(`@sys/billing: no policy for jurisdiction "${jurisdiction}"`)
    return p
  }

  // Classify each draft line via the policy, then materialise the priced InvoiceLine.
  const priceLines = (policy: InvoicePolicy, ctx: { sellerEntity: SellerEntity; billingAccount: BillingAccount; now: string }, lines: DraftLine[]): InvoiceLine[] =>
    lines.map((d) => {
      const tax = policy.classifyLine(ctx, d)
      const netAmount = { amountMinor: Math.round(d.unitAmount.amountMinor * d.quantity), currency: d.unitAmount.currency }
      return { id: d.id, category: d.category, description: d.description, quantity: d.quantity, unitAmount: d.unitAmount, netAmount, tax, metadata: d.metadata }
    })

  return {
    async issueInvoiceFromCapture(input) {
      // Idempotent on the source event — a replayed webhook can't mint a second invoice.
      const existing = await store.findDocumentBySourceEvent(input.sourceEvent.eventId)
      if (existing && existing.kind === 'invoice') return existing

      const { sellerEntity, billingAccount } = input
      const policy = policyFor(sellerEntity.jurisdiction)
      const ctx = { sellerEntity, billingAccount, now: input.now }

      const lines = priceLines(policy, ctx, input.lines)
      const taxBreakdown = policy.computeTax(lines)
      const { netTotal, grossTotal } = documentTotals(lines, taxBreakdown)
      const year = new Date(input.now).getUTCFullYear()
      const number = await store.reserveNumber(sellerEntity.id, year, 'invoice')

      const invoice: Invoice = {
        id: idFactory(),
        kind: 'invoice',
        status: 'issued_paid',
        number,
        sellerEntityId: sellerEntity.id,
        sellerSnapshot: sellerSnapshot(sellerEntity),
        billingAccountId: billingAccount.id,
        buyerSnapshot: buyerSnapshot(billingAccount),
        serviceRequestId: input.serviceRequestId,
        serviceName: input.serviceName,
        currency: sellerEntity.currency,
        lines,
        netTotal,
        taxBreakdown,
        grossTotal,
        jurisdiction: sellerEntity.jurisdiction,
        sourceEvent: input.sourceEvent,
        paymentApplications: input.paymentApplications,
        issuedAt: input.now,
      }

      const check = policy.validateDraft(ctx, invoice)
      if (!check.ok) throw new Error(`@sys/billing: invoice invalid — ${check.errors.map((e) => e.message).join('; ')}`)

      await store.insertDocument(invoice)
      return invoice
    },

    async issueCreditNoteFromRefund(input) {
      const existing = await store.findDocumentBySourceEvent(input.sourceEvent.eventId)
      if (existing && existing.kind === 'credit_note') return existing

      const invoice = await store.getInvoice(input.invoiceId)
      if (!invoice) throw new Error(`@sys/billing: unknown invoice "${input.invoiceId}"`)

      // Rebuild seller/buyer from the invoice's own snapshots (historical fidelity).
      const policy = policyFor(invoice.jurisdiction)
      const sellerEntity: SellerEntity = {
        id: invoice.sellerEntityId,
        legalName: invoice.sellerSnapshot.legalName,
        country: invoice.sellerSnapshot.country,
        jurisdiction: invoice.jurisdiction,
        taxRegistrations: invoice.sellerSnapshot.taxRegistrations,
        address: invoice.sellerSnapshot.address,
        currency: invoice.currency,
        branding: invoice.sellerSnapshot.branding,
      }
      const billingAccount: BillingAccount = {
        id: invoice.billingAccountId,
        kind: invoice.buyerSnapshot.kind,
        name: invoice.buyerSnapshot.name,
        country: invoice.buyerSnapshot.country,
        address: invoice.buyerSnapshot.address,
        taxId: invoice.buyerSnapshot.taxId,
      }
      const ctx = { sellerEntity, billingAccount, now: input.now }

      const lines = priceLines(policy, ctx, input.lines)
      const taxBreakdown = policy.computeTax(lines)
      const { netTotal, grossTotal } = documentTotals(lines, taxBreakdown)
      const year = new Date(input.now).getUTCFullYear()
      const number = await store.reserveNumber(sellerEntity.id, year, 'credit_note')

      const creditNote: CreditNote = {
        id: idFactory(),
        kind: 'credit_note',
        status: 'linked_to_refund',
        number,
        sellerEntityId: sellerEntity.id,
        sellerSnapshot: invoice.sellerSnapshot,
        billingAccountId: billingAccount.id,
        buyerSnapshot: invoice.buyerSnapshot,
        serviceRequestId: invoice.serviceRequestId,
        serviceName: invoice.serviceName,
        currency: invoice.currency,
        lines,
        netTotal,
        taxBreakdown,
        grossTotal,
        jurisdiction: invoice.jurisdiction,
        sourceEvent: input.sourceEvent,
        paymentApplications: input.paymentApplications,
        issuedAt: input.now,
        correctsInvoiceId: invoice.id,
        correctsInvoiceNumber: invoice.number,
        correctsLineIds: input.correctsLineIds,
        reasonCode: input.reasonCode,
        reasonText: input.reasonText,
      }
      await store.insertDocument(creditNote)
      return creditNote
    },
  }
}
