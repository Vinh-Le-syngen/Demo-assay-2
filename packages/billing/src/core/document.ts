// Pure document assembly: totals, number formatting, content hash. No IO.
import type { InvoiceLine, Money, TaxBreakdown } from './contract'

/** `AE-2026-000123`. The store allocates the sequence; this formats it. */
export function formatDocumentNumber(prefix: string, year: number, seq: number, pad = 6): string {
  return `${prefix}-${year}-${String(seq).padStart(pad, '0')}`
}

export function documentTotals(lines: InvoiceLine[], breakdown: TaxBreakdown): { netTotal: Money; grossTotal: Money } {
  const currency = lines[0]?.netAmount.currency ?? 'AED'
  const net = lines.reduce((s, l) => s + l.netAmount.amountMinor, 0)
  return {
    netTotal: { amountMinor: net, currency },
    grossTotal: { amountMinor: net + breakdown.totalTax.amountMinor, currency },
  }
}

/** FNV-1a content hash (hex). Tamper-evidence without a crypto dependency; host may swap for sha256. */
export function contentHash(canonical: unknown): string {
  const s = JSON.stringify(canonical)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return 'fnv1a_' + (h >>> 0).toString(16).padStart(8, '0')
}
