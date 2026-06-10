import { describe, it, expect, afterEach } from 'vitest'
import { checkConfig, configProbe } from '../probes'

const SET = ['SENTINEL_TEST_A', 'SENTINEL_TEST_B']
afterEach(() => SET.forEach((v) => delete process.env[v]))

describe('checkConfig', () => {
  it('not_configured when all vars are missing', () => {
    expect(checkConfig('svc', SET)).toMatchObject({ name: 'svc', status: 'not_configured' })
  })

  it('down when some (but not all) vars are missing', () => {
    process.env.SENTINEL_TEST_A = 'x'
    expect(checkConfig('svc', SET)).toMatchObject({ status: 'down', detail: 'missing: SENTINEL_TEST_B' })
  })

  it('up when all vars are present', () => {
    process.env.SENTINEL_TEST_A = 'x'
    process.env.SENTINEL_TEST_B = 'y'
    expect(checkConfig('svc', SET)).toEqual({ name: 'svc', status: 'up' })
  })
})

describe('configProbe', () => {
  it('wraps checkConfig as a Probe', async () => {
    process.env.SENTINEL_TEST_A = 'x'
    process.env.SENTINEL_TEST_B = 'y'
    const p = configProbe('svc', SET)
    expect(p.name).toBe('svc')
    expect(await p.run()).toEqual({ name: 'svc', status: 'up' })
  })
})
