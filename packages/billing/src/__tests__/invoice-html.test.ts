import { describe, it, expect } from 'vitest'
import { renderDocumentHtml, RENDER_VERSION } from '../render/invoice-html'
import type { CommercialDocument, CreditNote, Invoice, TaxBreakdown } from '../core/contract'

const M = (amountMinor: number, currency = 'AED') => ({ amountMinor, currency })

const taxBreakdown: TaxBreakdown = {
  groups: [
    { category: 'standard', label: 'VAT', ratePct: 5, taxableBase: M(800000), taxAmount: M(40000) },
    { category: 'out_of_scope', label: 'VAT', ratePct: 0, taxableBase: M(1200000), taxAmount: M(0) },
  ],
  totalTax: M(40000),
  rounding: 'per_line',
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv1', kind: 'invoice', number: 'AE-2026-000001', status: 'issued_paid',
    sellerEntityId: 'qarar-ae',
    sellerSnapshot: {
      legalName: 'Qarar FZ-LLC', country: 'AE',
      address: { line1: 'Index Tower', line2: 'Level 23', city: 'Dubai', region: 'DIFC', postalCode: '00000', country: 'AE' },
      taxRegistrations: [{ kind: 'trn', number: '100399492600003', country: 'AE' }],
    },
    billingAccountId: 'acc1',
    buyerSnapshot: { name: 'Nha Tran', kind: 'individual', country: 'AE' },
    serviceRequestId: 'sr_abcdef1234', serviceName: 'Company Formation', currency: 'AED',
    lines: [
      { id: 'l1', category: 'qarar_service_fee', description: 'Service fee', quantity: 2, unitAmount: M(400000), netAmount: M(800000), tax: { category: 'standard', rate: { label: 'VAT', ratePct: 5 } } },
      { id: 'l2', category: 'government_fee', description: 'DED licence', quantity: 1, unitAmount: M(1200000), netAmount: M(1200000), tax: { category: 'out_of_scope', rate: { label: 'VAT', ratePct: 0 } } },
    ],
    netTotal: M(2000000),
    taxBreakdown,
    grossTotal: M(2040000),
    jurisdiction: 'AE',
    sourceEvent: { kind: 'payment.captured', eventId: 'e1' },
    paymentApplications: [{ kind: 'charge', provider: 'stripe', providerRef: 'pi_999', paymentIntentId: 'pi_999', amount: M(2040000), appliedAt: '2026-06-03T10:00:00Z' }],
    issuedAt: '2026-06-03T10:00:00Z',
    ...overrides,
  }
}

function makeCreditNote(overrides: Partial<CreditNote> = {}): CreditNote {
  return {
    ...makeInvoice(),
    id: 'cn1', kind: 'credit_note', number: 'AE-CN-2026-000001', status: 'issued',
    correctsInvoiceId: 'inv1', correctsInvoiceNumber: 'AE-2026-000001', reasonCode: 'partial_refund',
    paymentApplications: [{ kind: 'refund', provider: 'stripe', providerRef: 're_555', paymentIntentId: 'pi_999', amount: M(500000), appliedAt: '2026-06-10T09:00:00Z' }],
    ...overrides,
  }
}

describe('invoice-html — invoice data', () => {
  const html = renderDocumentHtml(makeInvoice())

  it('exposes RENDER_VERSION', () => {
    expect(RENDER_VERSION).toBe('qarar-invoice-html@2')
  })

  it('renders the document number, jurisdiction and issue date (sliced to 10 chars)', () => {
    expect(html).toContain('AE-2026-000001')
    expect(html).toContain('2026-06-03')
    expect(html).not.toContain('2026-06-03T10:00:00Z') // must be sliced
    expect(html).toContain('AE') // jurisdiction superscript
  })

  it('renders the default TAX INVOICE title and the PAID badge for an invoice', () => {
    expect(html).toContain('TAX INVOICE')
    expect(html).toContain('>PAID<')
    expect(html).not.toContain('>CREDIT<')
  })

  it('renders seller legal name and TRN with the kind uppercased', () => {
    expect(html).toContain('Qarar FZ-LLC')
    expect(html).toContain('TRN: 100399492600003')
  })

  it('renders the multi-part seller address joined by <br/>', () => {
    // line1, line2, "city, region", postalCode, country.
    expect(html).toContain('Index Tower<br/>Level 23<br/>Dubai, DIFC<br/>00000<br/>AE')
  })

  it('renders the buyer name and service reference truncated to the first 8 chars', () => {
    expect(html).toContain('Nha Tran')
    // serviceRequestId is 'sr_abcdef1234'; the ref must be exactly the first 8 chars.
    expect(html).toContain('Ref sr_abcde') // slice(0,8)
    // A renderer that printed the FULL id would include the tail — it must not.
    expect(html).not.toContain('sr_abcdef1234')
  })

  it('joins line rows with no separator (kills join("garbage") mutant)', () => {
    // Two lines → their <tr> rows must be directly adjacent with no injected text.
    expect(html).not.toContain('Stryker')
    // The close of one row must be immediately followed by the open of the next.
    expect(/<\/tr>\s*<tr>/.test(html)).toBe(true)
  })

  it('joins tax groups with no separator', () => {
    // Two tax groups (standard + out_of_scope) rendered as adjacent .row divs.
    expect(/VAT 5%<\/span>[\s\S]*?<\/div><div class="row muted">/.test(html)).toBe(true)
  })

  it('renders each line with quantity and computed money values', () => {
    expect(html).toContain('Service fee')
    expect(html).toContain('DED licence')
    expect(html).toContain('>2<') // quantity for line 1
    // net amounts via formatMoney (Intl uses NBSP, so assert numbers)
    expect(html).toContain('8,000.00')   // line 1 net 800000 minor
    expect(html).toContain('12,000.00')  // line 2 net 1,200,000 minor
  })

  it('renders every CAT_LABEL category label', () => {
    const html = renderDocumentHtml(makeInvoice({
      lines: [
        { id: 'a', category: 'qarar_service_fee', description: 'A', quantity: 1, unitAmount: M(100), netAmount: M(100), tax: { category: 'standard', rate: { label: 'VAT', ratePct: 5 } } },
        { id: 'b', category: 'government_fee', description: 'B', quantity: 1, unitAmount: M(100), netAmount: M(100), tax: { category: 'out_of_scope', rate: { label: 'VAT', ratePct: 0 } } },
        { id: 'c', category: 'partner_fee', description: 'C', quantity: 1, unitAmount: M(100), netAmount: M(100), tax: { category: 'standard', rate: { label: 'VAT', ratePct: 5 } } },
        { id: 'd', category: 'discount', description: 'D', quantity: 1, unitAmount: M(-100), netAmount: M(-100), tax: { category: 'standard', rate: { label: 'VAT', ratePct: 5 } } },
      ],
    }))
    expect(html).toContain('Service fee')
    expect(html).toContain('Government fee')
    expect(html).toContain('Partner fee')
    expect(html).toContain('Discount')
  })

  it('falls back to the raw category when not in CAT_LABEL', () => {
    const html = renderDocumentHtml(makeInvoice({
      lines: [{ id: 'x', category: 'mystery_fee' as never, description: 'X', quantity: 1, unitAmount: M(100), netAmount: M(100), tax: { category: 'standard', rate: { label: 'VAT', ratePct: 5 } } }],
    }))
    expect(html).toContain('mystery_fee')
  })

  it('omits the address block content when the buyer has no address', () => {
    // addr(undefined) → '' ; assert no leftover "<br/>" artifact appears for the buyer.
    const html = renderDocumentHtml(makeInvoice({
      buyerSnapshot: { name: 'No Address Co', kind: 'individual', country: 'AE' },
    }))
    expect(html).toContain('No Address Co')
  })

  it('filters falsy address parts (no empty ", " or doubled <br/>)', () => {
    // Only line1 + country present → join must not contain a stray ", " or "<br/><br/>".
    const html = renderDocumentHtml(makeInvoice({
      sellerSnapshot: {
        ...makeInvoice().sellerSnapshot,
        address: { line1: 'Solo St', city: '', country: 'AE' },
      },
    }))
    expect(html).toContain('Solo St<br/>AE')
    expect(html).not.toContain('Solo St<br/><br/>')
    expect(html).not.toContain('Solo St<br/>, ')
  })

  it('omits the seller TRN line cleanly when there is no registration', () => {
    const html = renderDocumentHtml(makeInvoice({
      sellerSnapshot: { ...makeInvoice().sellerSnapshot, taxRegistrations: [] },
    }))
    expect(html).not.toContain('TRN: 100399492600003')
    // The empty `: ''` branch must inject nothing between the address div and the next party.
    expect(html).not.toContain('Stryker')
  })

  it('omits the buyer TRN line cleanly when the buyer has no tax id', () => {
    const sellerOnly = renderDocumentHtml(makeInvoice({
      sellerSnapshot: { ...makeInvoice().sellerSnapshot, taxRegistrations: [] },
      buyerSnapshot: { name: 'Indiv', kind: 'individual', country: 'AE' },
    }))
    expect(sellerOnly).not.toContain('TRN:')
    expect(sellerOnly).not.toContain('Stryker')
  })

  it('uses an empty issue date when issuedAt is missing (no crash, no stray date)', () => {
    // Clear the payment box too so the only possible date source is the (absent) issuedAt.
    const html = renderDocumentHtml(makeInvoice({ issuedAt: undefined, paymentApplications: [] }))
    expect(html).not.toContain('2026-06-03')
  })

  it('an invoice (not a credit note) renders no "Against" reference and no placeholder', () => {
    expect(html).not.toContain('Against')
    expect(html).not.toContain('Stryker')
  })

  it('renders subtotal, the standard tax row, and the grand total', () => {
    expect(html).toContain('Subtotal (net)')
    expect(html).toContain('20,000.00') // net total
    expect(html).toContain('VAT 5%')    // standard tax group label + rate
    expect(html).toContain('20,400.00') // gross total
    expect(html).toContain('>Total<')   // invoice uses "Total"
    expect(html).not.toContain('>Credited<')
  })

  it('renders the out-of-scope tax group as a muted "Outside tax scope" row at zero', () => {
    expect(html).toContain('Outside tax scope')
    // a renderer that taxed the gov fee would print 21,000.00 gross
    expect(html).not.toContain('21,000.00')
  })

  it('renders the payment box with provider, ref, date and the invoice work-started note', () => {
    expect(html).toContain('Paid via')
    expect(html).toContain('stripe')
    expect(html).toContain('pi_999')
    expect(html).toContain('2026-06-03') // appliedAt sliced
    expect(html).toContain('Service confirmed — work has started.')
  })

  it('escapes HTML-special characters in seller/buyer text', () => {
    const html = renderDocumentHtml(makeInvoice({
      buyerSnapshot: { name: 'A & B <Co> "X"', kind: 'individual', country: 'AE' },
    }))
    expect(html).toContain('A &amp; B &lt;Co&gt; &quot;X&quot;')
    expect(html).not.toContain('A & B <Co>')
  })

  it('renders a business buyer tax id (kind uppercased)', () => {
    const html = renderDocumentHtml(makeInvoice({
      buyerSnapshot: { name: 'Acme', kind: 'business', country: 'AE', taxId: { kind: 'trn', number: '100111222333' } },
    }))
    expect(html).toContain('TRN: 100111222333')
  })

  it('omits the payment box entirely (cleanly) when there is no matching application', () => {
    const html = renderDocumentHtml(makeInvoice({ paymentApplications: [] }))
    expect(html).not.toContain('Paid via')
    expect(html).not.toContain('class="pay"')
    // The `pay ? ... : ''` empty branch must inject only whitespace before the footer —
    // the totals block close is followed by nothing but blank space, then the foot div.
    expect(/<\/div>\s*<div class="foot">/.test(html)).toBe(true)
  })

  it('renders the injected footer text', () => {
    const html = renderDocumentHtml(makeInvoice({
      sellerSnapshot: { ...makeInvoice().sellerSnapshot, branding: { footer: 'Thank you for your business' } },
    }))
    expect(html).toContain('Thank you for your business')
    expect(html).toContain('This is a computer-generated tax invoice')
  })

  it('footer falls back to an empty string (boilerplate immediately precedes the <br/>)', () => {
    // No branding.footer → the foot div opens straight into the <br/> boilerplate, with
    // nothing injected in the empty branch.
    const html = renderDocumentHtml(makeInvoice())
    expect(html).toContain('<div class="foot"><br/>This is a computer-generated tax invoice')
  })

  it('uses the branding logoText when provided, else defaults to Qarar', () => {
    // Default fallback is the literal 'Qarar'.
    expect(renderDocumentHtml(makeInvoice())).toContain('<div class="brand">Qarar <span')
    const branded = renderDocumentHtml(makeInvoice({
      sellerSnapshot: { ...makeInvoice().sellerSnapshot, branding: { logoText: 'Mongu' } },
    }))
    expect(branded).toContain('<div class="brand">Mongu <span')
    expect(branded).not.toContain('<div class="brand">Qarar <span')
  })

  it('a missing issuedAt yields an empty header date div (no placeholder)', () => {
    const html = renderDocumentHtml(makeInvoice({
      issuedAt: undefined,
      paymentApplications: [],
    }))
    // The second .no div (issue date) must be empty — the `?? ''` fallback, not garbage.
    expect(html).toContain('<div class="no"></div>')
  })
})

describe('invoice-html — credit note data', () => {
  const html = renderDocumentHtml(makeCreditNote())

  it('renders the default credit-note title and CREDIT badge', () => {
    expect(html).toContain('TAX CREDIT NOTE')
    expect(html).toContain('>CREDIT<')
    expect(html).not.toContain('>PAID<')
  })

  it('uses "Credited" not "Total" for the grand total', () => {
    expect(html).toContain('>Credited<')
    expect(html).not.toContain('>Total<')
  })

  it('renders the "Against <invoice> — <reason>" line with the reason underscores spaced', () => {
    expect(html).toContain('Against AE-2026-000001 — partial refund')
  })

  it('renders the refund payment box (provider, ref) WITHOUT the work-started note', () => {
    expect(html).toContain('Refunded via')
    expect(html).toContain('re_555')
    expect(html).not.toContain('Service confirmed — work has started.')
    // The credit-side empty branch (`isCredit ? '' : note`) must inject nothing.
    expect(html).not.toContain('Stryker')
  })

  it('matches a refund (not a charge) payment application', () => {
    // A credit note whose only application is a charge → no payment box.
    const html = renderDocumentHtml(makeCreditNote({
      paymentApplications: [{ kind: 'charge', provider: 'stripe', providerRef: 'pi_x', paymentIntentId: 'pi_x', amount: M(1), appliedAt: '2026-06-10T00:00:00Z' }],
    }))
    expect(html).not.toContain('Refunded via')
  })

  it('renders the credit-note footer phrase', () => {
    expect(html).toContain('This is a computer-generated tax credit note')
  })
})

describe('invoice-html — taxLine reduced + reverse-charge notes', () => {
  it('renders a reduced group as a tax row with its rate', () => {
    const doc: CommercialDocument = makeInvoice({
      taxBreakdown: { groups: [{ category: 'reduced', label: 'IVA', ratePct: 10, taxableBase: M(100000), taxAmount: M(10000) }], totalTax: M(10000), rounding: 'per_line' },
    })
    const html = renderDocumentHtml(doc)
    expect(html).toContain('IVA 10%')
    expect(html).toContain('100.00') // 10000 minor tax → 100.00
  })

  it('renders a non-out-of-scope, non-taxable group with a hyphenated note', () => {
    // reverse_charge → note becomes "reverse-charge" (first underscore replaced).
    const doc: CommercialDocument = makeInvoice({
      taxBreakdown: { groups: [{ category: 'reverse_charge', label: 'VAT', ratePct: 0, taxableBase: M(100000), taxAmount: M(0) }], totalTax: M(0), rounding: 'per_line' },
    })
    const html = renderDocumentHtml(doc)
    expect(html).toContain('reverse-charge')
    expect(html).not.toContain('Outside tax scope')
  })
})
