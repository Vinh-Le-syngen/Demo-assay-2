import { describe, it, expect } from 'vitest'
import { computeTax } from '../core/tax'
import { documentTotals } from '../core/document'
import type { InvoiceLine } from '../core/contract'

// Regression (correctness): the gross-total composition when a document mixes taxable and
// out-of-scope lines. The out-of-scope line's NET is part of the subtotal, but it must contribute
// ZERO tax — so gross = net + (tax on taxable lines only). A prior failure class is "tax the whole
// subtotal", which over-charges the customer. These pin the exact figures so that bug can't return.

const service = (amountMinor: number): InvoiceLine => ({
  id: 's', category: 'qarar_service_fee', description: 'svc', quantity: 1,
  unitAmount: { amountMinor, currency: 'AED' }, netAmount: { amountMinor, currency: 'AED' },
  tax: { category: 'standard', rate: { label: 'VAT', ratePct: 5 } },
})
const govDisbursed = (amountMinor: number): InvoiceLine => ({
  id: 'g', category: 'government_fee', description: 'gov', quantity: 1,
  unitAmount: { amountMinor, currency: 'AED' }, netAmount: { amountMinor, currency: 'AED' },
  tax: { category: 'out_of_scope', rate: { label: 'VAT', ratePct: 0 } },
})

describe('regression — out-of-scope line is in net but never taxed', () => {
  it('gross = net + VAT-on-service-only (2,040,000), NOT VAT on the whole subtotal (2,100,000)', () => {
    const lines = [service(800000), govDisbursed(1200000)]
    const breakdown = computeTax(lines, 'per_line')
    const { netTotal, grossTotal } = documentTotals(lines, breakdown)
    expect(netTotal.amountMinor).toBe(2000000) // 8,000 + 12,000 AED — gov fee IS in the subtotal
    expect(breakdown.totalTax.amountMinor).toBe(40000) // 5% of 8,000 only
    expect(grossTotal.amountMinor).toBe(2040000)
    expect(grossTotal.amountMinor).not.toBe(2100000) // the "tax everything" regression
  })

  it('a document that is entirely out-of-scope has zero tax and gross === net', () => {
    const lines = [govDisbursed(500000), govDisbursed(300000)]
    const breakdown = computeTax(lines, 'per_line')
    const { netTotal, grossTotal } = documentTotals(lines, breakdown)
    expect(breakdown.totalTax.amountMinor).toBe(0)
    expect(grossTotal.amountMinor).toBe(netTotal.amountMinor)
    expect(grossTotal.amountMinor).toBe(800000)
  })

  it('the out-of-scope group is preserved in the breakdown (visible on the invoice), not dropped', () => {
    const breakdown = computeTax([service(800000), govDisbursed(1200000)], 'per_line')
    const oos = breakdown.groups.find((g) => g.category === 'out_of_scope')
    expect(oos).toBeDefined()
    expect(oos!.taxableBase.amountMinor).toBe(1200000) // its base is shown
    expect(oos!.taxAmount.amountMinor).toBe(0) // but it carries no tax
  })
})
