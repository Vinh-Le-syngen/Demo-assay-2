import { describe, it, expect } from 'vitest'
import { definePay, resolveCountry, parseProvider, fulfilmentTrigger } from '../core/config'

const VALID = {
  countries: {
    AE: { entity: 'qarar-ae', currency: 'AED', provider: 'stripe:acct_ae', methods: ['card', 'apple_pay'] },
    VN: { entity: 'qarar-vn', currency: 'VND', provider: 'vnpay:acct_vn', methods: ['card', 'momo'] },
  },
  fulfilment: { startsOn: 'captured' },
}

describe('definePay', () => {
  it('accepts a valid config', () => {
    const cfg = definePay(VALID)
    expect(Object.keys(cfg.countries)).toEqual(['AE', 'VN'])
    expect(cfg.fulfilment.startsOn).toBe('captured')
  })

  it('defaults fulfilment.startsOn to captured', () => {
    const cfg = definePay({ countries: VALID.countries })
    expect(cfg.fulfilment.startsOn).toBe('captured')
  })

  it('rejects a non-ISO-4217 currency', () => {
    expect(() =>
      definePay({ countries: { AE: { ...VALID.countries.AE, currency: 'aed' } } }),
    ).toThrow()
  })

  it('rejects a non-alpha-2 country key', () => {
    expect(() => definePay({ countries: { UAE: VALID.countries.AE } })).toThrow()
  })

  it('rejects an empty methods list', () => {
    expect(() =>
      definePay({ countries: { AE: { ...VALID.countries.AE, methods: [] } } }),
    ).toThrow()
  })

  it('rejects an unknown method', () => {
    expect(() =>
      definePay({ countries: { AE: { ...VALID.countries.AE, methods: ['bitcoin'] } } }),
    ).toThrow()
  })
})

describe('helpers', () => {
  const cfg = definePay(VALID)

  it('resolveCountry returns the entry or throws', () => {
    expect(resolveCountry(cfg, 'AE').entity).toBe('qarar-ae')
    expect(() => resolveCountry(cfg, 'ZZ')).toThrow(/no payment config/)
  })

  it('parseProvider splits id:account', () => {
    expect(parseProvider('stripe:acct_ae')).toEqual({ id: 'stripe', account: 'acct_ae' })
    expect(parseProvider('vnpay')).toEqual({ id: 'vnpay', account: undefined })
  })

  it('fulfilmentTrigger reads the policy', () => {
    expect(fulfilmentTrigger(cfg)).toBe('captured')
  })
})
