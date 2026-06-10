import { describe, it, expect } from 'vitest'
import { zeroMoney, addMoney, mulMoney, minorPer, formatMoney } from '../core/money'
import type { Money } from '../core/contract'

describe('money — primitives', () => {
  it('zeroMoney produces a zero amount in the given currency', () => {
    const z = zeroMoney('AED')
    expect(z).toEqual({ amountMinor: 0, currency: 'AED' })
  })

  it('addMoney sums minor units and keeps the first currency', () => {
    const sum = addMoney({ amountMinor: 650000, currency: 'AED' }, { amountMinor: 150000, currency: 'AED' })
    expect(sum).toEqual({ amountMinor: 800000, currency: 'AED' })
    // Subtraction mutant would yield 500000 — pin the additive result.
    expect(sum.amountMinor).toBe(800000)
  })

  it('addMoney with a negative addend subtracts (proves real addition, not subtraction)', () => {
    const sum = addMoney({ amountMinor: 1000, currency: 'AED' }, { amountMinor: -250, currency: 'AED' })
    expect(sum.amountMinor).toBe(750) // a `-` mutant would give 1250
  })

  it('mulMoney multiplies and rounds half-up', () => {
    expect(mulMoney({ amountMinor: 100, currency: 'AED' }, 3).amountMinor).toBe(300)
    // 100 * 0.5 = 50 → exact; 101 * 0.5 = 50.5 → rounds to 51 (a `/` mutant would give 202).
    expect(mulMoney({ amountMinor: 101, currency: 'AED' }, 0.5).amountMinor).toBe(51)
    expect(mulMoney({ amountMinor: 100, currency: 'AED' }, 0.5).currency).toBe('AED')
  })

  it('mulMoney rounds (not truncates) fractional minor results', () => {
    // 333 * 0.1 = 33.3 → Math.round → 33
    expect(mulMoney({ amountMinor: 333, currency: 'AED' }, 0.1).amountMinor).toBe(33)
    // 337 * 0.1 = 33.7 → Math.round → 34
    expect(mulMoney({ amountMinor: 337, currency: 'AED' }, 0.1).amountMinor).toBe(34)
  })
})

describe('money — minorPer (decimal exponent per currency)', () => {
  it('returns 100 for standard two-decimal currencies', () => {
    expect(minorPer('AED')).toBe(100)
    expect(minorPer('EUR')).toBe(100)
    expect(minorPer('SGD')).toBe(100)
  })

  it('returns 1 for zero-decimal currencies', () => {
    expect(minorPer('VND')).toBe(1)
    expect(minorPer('JPY')).toBe(1)
    expect(minorPer('KRW')).toBe(1)
  })

  it('uppercases the input before lookup (kills toUpperCase→toLowerCase mutant)', () => {
    // Lowercase 'vnd' must still resolve to the zero-decimal set.
    expect(minorPer('vnd')).toBe(1)
    expect(minorPer('aed')).toBe(100)
  })

  it('recognizes every member of the zero-decimal set', () => {
    for (const c of ['VND', 'JPY', 'KRW', 'CLP', 'ISK', 'XOF', 'XAF', 'BIF', 'PYG']) {
      expect(minorPer(c)).toBe(1)
    }
  })
})

describe('money — formatMoney', () => {
  it('formats a two-decimal currency dividing by 100', () => {
    // 2,040,000 minor AED → 20,400.00 major.
    const out = formatMoney({ amountMinor: 2040000, currency: 'AED' })
    expect(out).toContain('20,400.00')
    expect(out).toContain('AED')
  })

  it('formats a zero-decimal currency without dividing', () => {
    // VND minorPer = 1, so 100000 minor → 100,000 major (not 1,000).
    const out = formatMoney({ amountMinor: 100000, currency: 'VND' })
    expect(out).toContain('100,000')
    expect(out).not.toContain('1,000.00')
  })

  it('falls back to a plain string for an invalid currency code (catch branch)', () => {
    // A 2-letter code is not valid ISO-4217 → Intl.NumberFormat throws → fallback path.
    // minorPer('US') = 100 (not zero-decimal), so 123456 minor → 1,234.56 major.
    const m: Money = { amountMinor: 123456, currency: 'US' }
    const out = formatMoney(m)
    expect(out).toBe('US 1,234.56')
  })

  it('fallback divides by minorPer and prefixes the raw code', () => {
    // 'ZZ' throws in Intl → fallback. 5000 / 100 = 50 → toLocaleString('en') = '50'.
    const out = formatMoney({ amountMinor: 5000, currency: 'ZZ' })
    expect(out).toBe('ZZ 50')
  })
})
