// Pure tax computation over already-classified lines. Rounding is policy-set.
import type { InvoiceLine, TaxBreakdown, TaxCategory } from './contract'

/** Only standard/reduced categories carry tax; zero/exempt/out_of_scope/reverse_charge do not. */
export const isTaxable = (c: TaxCategory): boolean => c === 'standard' || c === 'reduced'

export function computeTax(lines: InvoiceLine[], rounding: 'per_line' | 'per_document'): TaxBreakdown {
  const currency = lines[0]?.netAmount.currency ?? 'AED'
  const groups = new Map<string, { category: TaxCategory; label: string; ratePct: number; base: number; tax: number }>()

  for (const l of lines) {
    const { category, rate } = l.tax
    const key = `${category}|${rate.ratePct}|${rate.label}`
    const g = groups.get(key) ?? { category, label: rate.label, ratePct: rate.ratePct, base: 0, tax: 0 }
    g.base += l.netAmount.amountMinor
    if (rounding === 'per_line' && isTaxable(category)) {
      g.tax += Math.round((l.netAmount.amountMinor * rate.ratePct) / 100)
    }
    groups.set(key, g)
  }

  let totalTax = 0
  const out = [...groups.values()].map((g) => {
    const taxAmount = rounding === 'per_document'
      ? (isTaxable(g.category) ? Math.round((g.base * g.ratePct) / 100) : 0)
      : g.tax
    totalTax += taxAmount
    return {
      category: g.category,
      label: g.label,
      ratePct: g.ratePct,
      taxableBase: { amountMinor: g.base, currency },
      taxAmount: { amountMinor: taxAmount, currency },
    }
  })

  return { groups: out, totalTax: { amountMinor: totalTax, currency }, rounding }
}
