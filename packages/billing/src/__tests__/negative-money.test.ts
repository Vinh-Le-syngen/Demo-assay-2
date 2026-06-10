import { describe, it, expect } from 'vitest'
import { addMoney, mulMoney, minorPer } from '../core/money'
import { computeTax } from '../core/tax'
import type { InvoiceLine } from '../core/contract'

// Negative (resilience): hostile/degenerate numeric inputs to the money + tax primitives. These are
// pure functions, so "bad input" means negative amounts, fractional quantities, and overflow-scale
// magnitudes — the arithmetic must stay exact and not silently corrupt totals.

const line = (amountMinor: number, ratePct: number, category: InvoiceLine['tax']['category'] = 'standard'): InvoiceLine => ({
  id: 'l', category: 'qarar_service_fee', description: 'x', quantity: 1,
  unitAmount: { amountMinor, currency: 'AED' }, netAmount: { amountMinor, currency: 'AED' },
  tax: { category, rate: { label: 'VAT', ratePct } },
})

describe('negative — money primitives under degenerate inputs', () => {
  it('addMoney with a negative addend produces a credit (refund) amount, not garbage', () => {
    expect(addMoney({ amountMinor: 0, currency: 'AED' }, { amountMinor: -500000, currency: 'AED' }).amountMinor).toBe(-500000)
  })

  it('mulMoney by a negative quantity yields a negative (credit) net', () => {
    // a credit-note line is a negative quantity of the original — must flip sign, not abs().
    expect(mulMoney({ amountMinor: 100000, currency: 'AED' }, -1).amountMinor).toBe(-100000)
  })

  it('mulMoney with a fractional quantity rounds rather than producing a fractional minor unit', () => {
    // 100001 * (1/3) = 33333.66… — money has no sub-minor unit, so it MUST be an integer.
    const out = mulMoney({ amountMinor: 100001, currency: 'AED' }, 1 / 3)
    expect(Number.isInteger(out.amountMinor)).toBe(true)
    expect(out.amountMinor).toBe(33334)
  })

  it('minorPer never returns 0 (a 0 divisor would make formatMoney emit Infinity)', () => {
    for (const c of ['AED', 'EUR', 'VND', 'JPY', 'ZZZ', '']) {
      expect(minorPer(c)).toBeGreaterThan(0)
    }
  })
})

describe('negative — computeTax over hostile line sets', () => {
  it('an empty line set yields a zero, well-formed breakdown (no crash, no NaN)', () => {
    const b = computeTax([], 'per_line')
    expect(b.groups).toEqual([])
    expect(b.totalTax.amountMinor).toBe(0)
    expect(Number.isNaN(b.totalTax.amountMinor)).toBe(false)
  })

  it('a negative net line (credit) produces a negative tax of the same magnitude', () => {
    // -200000 minor @ 5% = -10000 minor. Tax of a credit must be negative, not 0 or positive.
    const b = computeTax([line(-200000, 5)], 'per_line')
    expect(b.totalTax.amountMinor).toBe(-10000)
  })

  it('overflow-scale amounts stay exact integers within Number.MAX_SAFE_INTEGER', () => {
    // A 90-billion-minor line @ 5% = 4.5bn minor — still well under 2^53, must be exact.
    const big = 9_000_000_000
    const b = computeTax([line(big, 5)], 'per_line')
    expect(b.totalTax.amountMinor).toBe(450_000_000)
    expect(Number.isSafeInteger(b.totalTax.amountMinor)).toBe(true)
  })

  it('non-taxable categories contribute zero tax even with a nonzero ratePct present', () => {
    // out_of_scope carries ratePct 0 in practice; assert the GUARD: isTaxable, not the rate, decides.
    const b = computeTax([line(1_000_000, 9, 'out_of_scope')], 'per_line')
    expect(b.totalTax.amountMinor).toBe(0)
  })
})
