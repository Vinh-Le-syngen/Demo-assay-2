import { describe, it, expect } from 'vitest'
import { createUaePolicy } from '../policies/uae'
import { createSgPolicy } from '../policies/sg'
import { createEsPolicy } from '../policies/es'
import { createVnPolicy } from '../policies/vn'
import { createBillingBridge } from '../core/bridge'
import type { BillingStore, CommercialDocument, DraftLine, Invoice, InvoicePolicy, PolicyContext, SellerEntity } from '../core/contract'

const ctx = { sellerEntity: {} as never, billingAccount: { kind: 'individual' } as never, now: '2026-06-03T00:00:00Z' } as PolicyContext
const svc = (currency: string): DraftLine => ({ id: 'svc', category: 'qarar_service_fee', description: 'X', quantity: 1, unitAmount: { amountMinor: 100000, currency } })

describe('per-country policies — each issues in its own regime', () => {
  it('UAE: VAT 5%, AED, paid_only, referencing', () => {
    const p = createUaePolicy()
    expect(p.classifyLine(ctx, svc('AED')).rate).toMatchObject({ label: 'VAT', ratePct: 5 })
    expect(p.billingMode).toBe('paid_only')
    expect(p.creditNoteStyle).toBe('referencing')
  })
  it('SG: GST 9%, SGD, on_supply', () => {
    const p = createSgPolicy()
    expect(p.classifyLine(ctx, svc('SGD')).rate).toMatchObject({ label: 'GST', ratePct: 9 })
    expect(p.billingMode).toBe('on_supply')
  })
  it('ES: IVA 21%, EUR, rectifying credit notes', () => {
    const p = createEsPolicy()
    expect(p.classifyLine(ctx, svc('EUR')).rate).toMatchObject({ label: 'IVA', ratePct: 21 })
    expect(p.creditNoteStyle).toBe('rectifying')
  })
  it('VN: VAT 10%, VND', () => {
    const p = createVnPolicy()
    expect(p.classifyLine(ctx, svc('VND')).rate).toMatchObject({ label: 'VAT', ratePct: 10 })
  })

  it('disbursement evidence is honored in every jurisdiction', () => {
    const gov: DraftLine = { id: 'g', category: 'government_fee', description: 'fee', quantity: 1, unitAmount: { amountMinor: 1000, currency: 'EUR' }, disbursement: { authorizedAsAgent: true, invoiceInCustomerName: true, exactPassThrough: true, separatelyItemized: true } }
    for (const p of [createUaePolicy(), createSgPolicy(), createEsPolicy(), createVnPolicy()]) {
      expect(p.classifyLine(ctx, gov).category).toBe('out_of_scope')
    }
  })
})

// End-to-end issuance per country: the COMPUTED tax/total, the numbering series, and the rendered
// label must all match the jurisdiction — not just the policy's config echoed back.
class FakeStore implements BillingStore {
  private seq = 0
  async findDocumentBySourceEvent() { return null }
  async reserveNumber(entityId: string, year: number, kind: 'invoice' | 'credit_note') {
    this.seq++
    const cc = entityId.replace('qarar-', '').toUpperCase()
    return `${kind === 'invoice' ? cc : `${cc}-CN`}-${year}-${String(this.seq).padStart(6, '0')}`
  }
  async insertDocument() {}
  async getInvoice() { return null }
}

const seller = (id: string, currency: string, taxKind: SellerEntity['taxRegistrations'][number]['kind']): SellerEntity => ({
  id, legalName: `Qarar ${id}`, country: id.slice(-2).toUpperCase(), jurisdiction: id.slice(-2).toUpperCase(), currency,
  taxRegistrations: [{ kind: taxKind, number: 'TAX123', country: id.slice(-2).toUpperCase() }],
  address: { line1: 'x', city: 'y', country: id.slice(-2).toUpperCase() },
})

describe('per-country issuance — computed totals, numbering, render', () => {
  const cases: Array<{ cc: string; policy: InvoicePolicy; seller: SellerEntity; net: number; currency: string; rate: number; label: string }> = [
    { cc: 'SG', policy: createSgPolicy(), seller: seller('qarar-sg', 'SGD', 'gst'), net: 100000, currency: 'SGD', rate: 9, label: 'GST' },
    { cc: 'ES', policy: createEsPolicy(), seller: seller('qarar-es', 'EUR', 'nif'), net: 100000, currency: 'EUR', rate: 21, label: 'IVA' },
    { cc: 'VN', policy: createVnPolicy(), seller: seller('qarar-vn', 'VND', 'mst'), net: 1000000, currency: 'VND', rate: 10, label: 'VAT' },
  ]

  for (const k of cases) {
    it(`${k.cc}: ${k.label} ${k.rate}% computed + ${k.cc}- numbering + rendered`, async () => {
      const bridge = createBillingBridge({ store: new FakeStore(), policies: { [k.cc]: k.policy }, idFactory: () => 'id' })
      const inv = (await bridge.issueInvoiceFromCapture({
        sellerEntity: k.seller,
        billingAccount: { id: 'b', kind: 'individual', name: 'Buyer', country: k.cc },
        serviceRequestId: 'sr', serviceName: 'Service',
        lines: [{ id: 'svc', category: 'qarar_service_fee', description: 'Service', quantity: 1, unitAmount: { amountMinor: k.net, currency: k.currency } }],
        sourceEvent: { kind: 'payment.captured', eventId: `e_${k.cc}` }, paymentApplications: [], now: '2026-06-03T00:00:00Z',
      })) as Invoice

      const expectedTax = Math.round((k.net * k.rate) / 100)
      expect(inv.taxBreakdown.totalTax.amountMinor).toBe(expectedTax) // real computation
      expect(inv.grossTotal.amountMinor).toBe(k.net + expectedTax)
      expect(inv.netTotal.amountMinor).toBe(k.net)
      expect(inv.number.startsWith(`${k.cc}-`)).toBe(true) // country numbering series
      expect(inv.currency).toBe(k.currency)
      const html = (k.policy.renderInvoice(inv) as { html: string }).html
      expect(html).toContain(`${k.label} ${k.rate}%`) // rendered tax label + rate
    })
  }

  it('rejects a business document with no tax id (validation actually runs)', async () => {
    const bridge = createBillingBridge({ store: new FakeStore(), policies: { SG: createSgPolicy() }, idFactory: () => 'id' })
    await expect(
      bridge.issueInvoiceFromCapture({
        sellerEntity: seller('qarar-sg', 'SGD', 'gst'),
        billingAccount: { id: 'b', kind: 'business', name: 'Acme', country: 'SG' }, // business, no taxId
        serviceRequestId: 'sr', serviceName: 'S',
        lines: [{ id: 'svc', category: 'qarar_service_fee', description: 'S', quantity: 1, unitAmount: { amountMinor: 1000, currency: 'SGD' } }],
        sourceEvent: { kind: 'payment.captured', eventId: 'e_val' }, paymentApplications: [], now: '2026-06-03T00:00:00Z',
      }),
    ).rejects.toThrow(/GST Reg/)
  })
})
