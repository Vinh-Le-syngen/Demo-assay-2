import { describe, it, expect } from 'vitest'
import { renderDocumentHtml } from '../render/invoice-html'
import type { Invoice, Money } from '../core/contract'

// Adversarial (resilience): a buyer/seller-controlled string carrying an HTML/script payload must be
// neutralised on render. The invoice HTML becomes a PDF emailed to customers — an unescaped `<script>`
// or attribute-breaking `"` is a stored-XSS / template-injection vector. Every user-controlled field
// the renderer interpolates must be entity-escaped.

const M = (amountMinor: number, currency = 'AED'): Money => ({ amountMinor, currency })

const XSS = '<script>alert(1)</script>'
const ATTR = '"><img src=x onerror=alert(1)>'

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv1', kind: 'invoice', number: 'AE-2026-000001', status: 'issued_paid',
    sellerEntityId: 'qarar-ae',
    sellerSnapshot: {
      legalName: 'Qarar FZ-LLC', country: 'AE',
      address: { line1: 'Index Tower', city: 'Dubai', country: 'AE' },
      taxRegistrations: [{ kind: 'trn', number: '100399492600003', country: 'AE' }],
    },
    billingAccountId: 'acc1',
    buyerSnapshot: { name: 'Nha Tran', kind: 'individual', country: 'AE' },
    serviceRequestId: 'sr_abcdef1234', serviceName: 'Company Formation', currency: 'AED',
    lines: [
      { id: 'l1', category: 'qarar_service_fee', description: 'Service fee', quantity: 1, unitAmount: M(800000), netAmount: M(800000), tax: { category: 'standard', rate: { label: 'VAT', ratePct: 5 } } },
    ],
    netTotal: M(800000),
    taxBreakdown: { groups: [{ category: 'standard', label: 'VAT', ratePct: 5, taxableBase: M(800000), taxAmount: M(40000) }], totalTax: M(40000), rounding: 'per_line' },
    grossTotal: M(840000),
    jurisdiction: 'AE',
    sourceEvent: { kind: 'payment.captured', eventId: 'e1' },
    paymentApplications: [{ kind: 'charge', provider: 'stripe', providerRef: 'pi_999', paymentIntentId: 'pi_999', amount: M(840000), appliedAt: '2026-06-03T10:00:00Z' }],
    issuedAt: '2026-06-03T10:00:00Z',
    ...overrides,
  }
}

describe('adversarial — injection in buyer/seller text is escaped on render', () => {
  it('escapes a <script> payload in the buyer name (no live script element survives)', () => {
    const html = renderDocumentHtml(makeInvoice({ buyerSnapshot: { name: XSS, kind: 'individual', country: 'AE' } }))
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;') // rendered as inert text
  })

  it('escapes a payload injected via the line-item description', () => {
    const inv = makeInvoice()
    inv.lines[0]!.description = XSS
    const html = renderDocumentHtml(inv)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes the seller legal name and provider ref (payment box)', () => {
    const inv = makeInvoice({
      sellerSnapshot: {
        legalName: XSS, country: 'AE',
        address: { line1: 'x', city: 'Dubai', country: 'AE' },
        taxRegistrations: [{ kind: 'trn', number: '100399492600003', country: 'AE' }],
      },
      paymentApplications: [{ kind: 'charge', provider: XSS, providerRef: XSS, paymentIntentId: 'pi', amount: M(840000), appliedAt: '2026-06-03T10:00:00Z' }],
    })
    const html = renderDocumentHtml(inv)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('neutralises an attribute-breaking double-quote payload (no raw " from user data escaping the markup)', () => {
    const html = renderDocumentHtml(makeInvoice({ buyerSnapshot: { name: ATTR, kind: 'individual', country: 'AE' } }))
    // the raw onerror payload must not appear verbatim; the " is entity-encoded.
    expect(html).not.toContain('"><img src=x onerror=alert(1)>')
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;')
  })

  it('escapes a payload in the seller branding logo text and footer', () => {
    const inv = makeInvoice()
    inv.sellerSnapshot.branding = { logoText: XSS, footer: XSS }
    const html = renderDocumentHtml(inv)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
