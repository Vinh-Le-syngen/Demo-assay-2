import { describe, it, expect } from 'vitest'
import { computeTax } from '../core/tax'
import { formatMoney } from '../core/money'
import type { InvoiceLine } from '../core/contract'

// Regression (correctness): two concrete, previously-fragile edges.
//   1. per-line vs per-document rounding DIVERGE — rounding each line then summing is not the same as
//      taxing the summed base. UAE/ES/SG/VN are `per_line`; a silent switch to per-document would
//      under-collect tax. This pins the per-line behaviour at the boundary where they differ.
//   2. zero-decimal currency (VND) must NOT be divided by 100 on display — a regression here prints
//      amounts 100x too small on every Vietnamese invoice.

const line = (amountMinor: number, ratePct = 5): InvoiceLine => ({
  id: Math.random().toString(), category: 'qarar_service_fee', description: 'x', quantity: 1,
  unitAmount: { amountMinor, currency: 'AED' }, netAmount: { amountMinor, currency: 'AED' },
  tax: { category: 'standard', rate: { label: 'VAT', ratePct } },
})

describe('regression — per-line rounding is independent per line (boundary case)', () => {
  it('two 333-minor lines @5% round to 17 each → 34 total (per-line), not 33 (per-document)', () => {
    // 333 * 5% = 16.65 → 17 per line; 2 × 17 = 34.
    // per-document would be (333+333=666) * 5% = 33.3 → 33. The two MUST differ here.
    const lines = [line(333), line(333)]
    expect(computeTax(lines, 'per_line').totalTax.amountMinor).toBe(34)
    expect(computeTax(lines, 'per_document').totalTax.amountMinor).toBe(33)
  })

  it('a single line gives the same result under either rounding mode (no spurious divergence)', () => {
    const lines = [line(800000)]
    expect(computeTax(lines, 'per_line').totalTax.amountMinor).toBe(40000)
    expect(computeTax(lines, 'per_document').totalTax.amountMinor).toBe(40000)
  })
})

describe('regression — zero-decimal currency is never divided by 100', () => {
  it('VND 100,000 minor renders as 100,000 (not 1,000.00)', () => {
    const out = formatMoney({ amountMinor: 100000, currency: 'VND' })
    expect(out).toContain('100,000')
    expect(out).not.toContain('1,000.00')
  })

  it('VND tax computation operates on whole-dong minor units', () => {
    // 1,000,000 VND net @10% = 100,000 VND tax (VND minor === major).
    const lines: InvoiceLine[] = [{
      id: 'v', category: 'qarar_service_fee', description: 'x', quantity: 1,
      unitAmount: { amountMinor: 1000000, currency: 'VND' }, netAmount: { amountMinor: 1000000, currency: 'VND' },
      tax: { category: 'standard', rate: { label: 'VAT', ratePct: 10 } },
    }]
    const b = computeTax(lines, 'per_line')
    expect(b.totalTax).toEqual({ amountMinor: 100000, currency: 'VND' })
  })
})
