// HTML renderer for invoices + credit notes. Self-contained (inline CSS), A4 print-ready → the
// host turns it into the PDF emailed to the customer. Pure: document → HTML string.
// The package hardcodes NO brand colors — the theme is injected via sellerSnapshot.branding.theme.

import type { CommercialDocument, CreditNote, InvoiceTheme, PostalAddress, TaxBreakdown } from '../core/contract'
import { formatMoney } from '../core/money'

export const RENDER_VERSION = 'qarar-invoice-html@2'

// Neutral defaults — a host (Qarar) overrides with its design tokens.
// Stryker disable StringLiteral,ObjectLiteral: the values below are pure cosmetic CSS colour
// tokens. Mutating a hex string produces a "survivor" that is not a meaningful behaviour bug,
// and the theme-injection seam (a host overriding these) is exercised elsewhere.
const DEFAULT_THEME: InvoiceTheme = {
  primary: '#0f172a',
  accent: '#0d9488',
  text: '#0f172a',
  muted: '#475569',
  faint: '#94a3b8',
  border: '#e2e8f0',
  soft: '#f8fafc',
  paidBg: '#ecfdf5',
  paidFg: '#047857',
  creditBg: '#fef2f2',
  creditFg: '#b91c1c',
}
// Stryker restore StringLiteral,ObjectLiteral

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const addr = (a?: PostalAddress): string =>
  a
    ? [a.line1, a.line2, [a.city, a.region].filter(Boolean).join(', '), a.postalCode, a.country]
        .filter((x): x is string => Boolean(x))
        .map(esc)
        .join('<br/>')
    : ''

const CAT_LABEL: Record<string, string> = {
  qarar_service_fee: 'Service fee',
  government_fee: 'Government fee',
  partner_fee: 'Partner fee',
  discount: 'Discount',
}

function taxLine(b: TaxBreakdown, t: InvoiceTheme): string {
  return b.groups
    .map((g) => {
      if (g.category === 'standard' || g.category === 'reduced') {
        return `<div class="row"><span>${esc(g.label)} ${g.ratePct}%</span><span>${formatMoney(g.taxAmount)}</span></div>`
      }
      const note = g.category === 'out_of_scope' ? 'Outside tax scope' : g.category.replace('_', '-')
      return `<div class="row muted"><span>${esc(g.label)} — ${note}</span><span>${formatMoney({ amountMinor: 0, currency: g.taxAmount.currency })}</span></div>`
    })
    .join('')
}

export function renderDocumentHtml(doc: CommercialDocument, opts?: { title?: string }): string {
  const isCredit = doc.kind === 'credit_note'
  const title = opts?.title ?? (isCredit ? 'TAX CREDIT NOTE' : 'TAX INVOICE')
  const t: InvoiceTheme = { ...DEFAULT_THEME, ...(doc.sellerSnapshot.branding?.theme ?? {}) }
  const s = doc.sellerSnapshot
  const b = doc.buyerSnapshot
  const trn = s.taxRegistrations[0]
  const buyerTrn = b.taxId
  const pay = doc.paymentApplications.find((p) => p.kind === (isCredit ? 'refund' : 'charge'))
  const issued = (doc.issuedAt ?? '').slice(0, 10)
  const cn = isCredit ? (doc as CreditNote) : null
  const badgeBg = isCredit ? t.creditBg : t.paidBg
  const badgeFg = isCredit ? t.creditFg : t.paidFg

  const lineRows = doc.lines
    .map(
      (l) => `<tr>
        <td>${esc(l.description)}<div class="cat">${CAT_LABEL[l.category] ?? l.category}</div></td>
        <td class="num">${l.quantity}</td>
        <td class="num">${formatMoney(l.unitAmount)}</td>
        <td class="num">${formatMoney(l.netAmount)}</td>
      </tr>`,
    )
    .join('')

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${t.text};background:#fff;font-size:13px;line-height:1.5}
    .page{width:210mm;min-height:297mm;padding:18mm;margin:0 auto;background:#fff}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${t.accent};padding-bottom:16px}
    .brand{font-size:26px;font-weight:800;letter-spacing:-.5px;color:${t.primary}}
    .brand .ae{font-size:11px;font-weight:700;color:${t.accent};letter-spacing:2px;vertical-align:super}
    .doc-title{text-align:right}
    .doc-title h1{font-size:18px;letter-spacing:3px;color:${t.primary}}
    .doc-title .no{font-size:13px;color:${t.muted};margin-top:4px}
    .badge{display:inline-block;margin-top:8px;padding:3px 12px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:1px;background:${badgeBg};color:${badgeFg}}
    .meta{display:flex;justify-content:space-between;margin-top:22px;gap:24px}
    .party{flex:1}
    .party h3{font-size:10px;letter-spacing:1.5px;color:${t.faint};text-transform:uppercase;margin-bottom:6px}
    .party .name{font-weight:700;font-size:14px;color:${t.primary}}
    .party .trn{margin-top:6px;font-size:12px;color:${t.muted}}
    table{width:100%;border-collapse:collapse;margin-top:26px}
    thead th{text-align:left;font-size:10px;letter-spacing:1px;color:${t.faint};text-transform:uppercase;border-bottom:1.5px solid ${t.border};padding:0 0 8px}
    thead th.num,tbody td.num{text-align:right}
    tbody td{padding:12px 0;border-bottom:1px solid ${t.border};vertical-align:top}
    tbody .cat{font-size:11px;color:${t.faint};margin-top:2px}
    .totals{margin-left:auto;width:46%;margin-top:18px}
    .totals .row{display:flex;justify-content:space-between;padding:6px 0}
    .totals .row.muted span{color:${t.faint}}
    .totals .grand{display:flex;justify-content:space-between;border-top:2px solid ${t.primary};margin-top:8px;padding-top:12px;font-size:17px;font-weight:800;color:${t.primary}}
    .pay{margin-top:26px;background:${t.soft};border:1px solid ${t.border};border-radius:10px;padding:14px 16px;font-size:12px;color:${t.muted}}
    .pay b{color:${t.primary}}
    .foot{margin-top:30px;border-top:1px solid ${t.border};padding-top:12px;font-size:11px;color:${t.faint};text-align:center}
    .ref{font-size:11px;color:${t.faint};margin-top:2px}
  </style></head><body><div class="page">
    <div class="top">
      <div>
        <div class="brand">${esc(s.branding?.logoText ?? 'Qarar')} <span class="ae">${esc(doc.jurisdiction)}</span></div>
        <div class="ref" style="margin-top:6px">${esc(s.legalName)}</div>
      </div>
      <div class="doc-title">
        <h1>${title}</h1>
        <div class="no">${esc(doc.number)}</div>
        <div class="no">${esc(issued)}</div>
        <div class="badge">${isCredit ? 'CREDIT' : 'PAID'}</div>
      </div>
    </div>

    <div class="meta">
      <div class="party">
        <h3>From</h3>
        <div class="name">${esc(s.legalName)}</div>
        <div class="trn">${addr(s.address)}</div>
        ${trn ? `<div class="trn">${trn.kind.toUpperCase()}: ${esc(trn.number)}</div>` : ''}
      </div>
      <div class="party">
        <h3>Bill to</h3>
        <div class="name">${esc(b.name)}</div>
        <div class="trn">${addr(b.address)}</div>
        ${buyerTrn ? `<div class="trn">${esc(buyerTrn.kind.toUpperCase())}: ${esc(buyerTrn.number)}</div>` : ''}
      </div>
      <div class="party">
        <h3>Service</h3>
        <div class="name">${esc(doc.serviceName)}</div>
        <div class="ref">Ref ${esc(doc.serviceRequestId.slice(0, 8))}</div>
        ${cn ? `<div class="trn">Against ${esc(cn.correctsInvoiceNumber)} — ${cn.reasonCode.replace('_', ' ')}</div>` : ''}
      </div>
    </div>

    <table>
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead>
      <tbody>${lineRows}</tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Subtotal (net)</span><span>${formatMoney(doc.netTotal)}</span></div>
      ${taxLine(doc.taxBreakdown, t)}
      <div class="grand"><span>${isCredit ? 'Credited' : 'Total'}</span><span>${formatMoney(doc.grossTotal)}</span></div>
    </div>

    ${
      pay
        ? `<div class="pay">${isCredit ? 'Refunded' : 'Paid'} via <b>${esc(pay.provider)}</b> · ref <b>${esc(pay.providerRef)}</b> · ${esc(pay.appliedAt.slice(0, 10))}. ${isCredit ? '' : 'Service confirmed — work has started.'}</div>`
        : ''
    }

    <div class="foot">${esc(s.branding?.footer ?? '')}<br/>This is a computer-generated ${isCredit ? 'tax credit note' : 'tax invoice'}. Content hash on file.</div>
  </div></body></html>`
}
