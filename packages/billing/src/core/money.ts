import type { Money } from './contract'

export const zeroMoney = (currency: string): Money => ({ amountMinor: 0, currency })
export const addMoney = (a: Money, b: Money): Money => ({ amountMinor: a.amountMinor + b.amountMinor, currency: a.currency })
export const mulMoney = (m: Money, q: number): Money => ({ amountMinor: Math.round(m.amountMinor * q), currency: m.currency })

const ZERO_DECIMAL = new Set(['VND', 'JPY', 'KRW', 'CLP', 'ISK', 'XOF', 'XAF', 'BIF', 'PYG'])
export const minorPer = (currency: string): number => (ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100)

/** Display string, e.g. "AED 8,400.00" / "VND 100,000". */
export function formatMoney(m: Money): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: m.currency }).format(m.amountMinor / minorPer(m.currency))
  } catch {
    return `${m.currency} ${(m.amountMinor / minorPer(m.currency)).toLocaleString('en')}`
  }
}
