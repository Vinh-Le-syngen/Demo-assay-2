import { describe, it, expect } from 'vitest'
import { runHealth, healthAlert, defineSentinel, type DepStatus } from '../core'

const probe = (s: DepStatus) => ({ name: s.name, run: () => s })

describe('runHealth', () => {
  it('is healthy when all critical deps are up (non-critical down is tolerated)', async () => {
    const config = defineSentinel({
      probes: [
        probe({ name: 'db', status: 'up' }),
        probe({ name: 'mailer', status: 'down', detail: 'timeout' }),
      ],
      critical: ['db'],
    })
    const report = await runHealth(config)
    expect(report.healthy).toBe(true)
    expect(report.dependencies).toHaveLength(2)
  })

  it('is unhealthy when a critical dep is down', async () => {
    const report = await runHealth({
      probes: [probe({ name: 'db', status: 'down' })],
      critical: ['db'],
    })
    expect(report.healthy).toBe(false)
  })

  it('treats every probe as critical when none specified', async () => {
    const report = await runHealth({
      probes: [probe({ name: 'a', status: 'up' }), probe({ name: 'b', status: 'down' })],
    })
    expect(report.healthy).toBe(false)
  })

  it('awaits async probes', async () => {
    const report = await runHealth({
      probes: [{ name: 'x', run: async () => ({ name: 'x', status: 'up' }) }],
    })
    expect(report.healthy).toBe(true)
  })
})

describe('healthAlert', () => {
  it('does not alert when healthy and nothing down', () => {
    expect(healthAlert({ healthy: true, dependencies: [{ name: 'db', status: 'up' }] })).toEqual({
      alert: false,
      summary: 'healthy',
    })
  })

  it('alerts and summarizes down dependencies', () => {
    const r = healthAlert({
      healthy: false,
      dependencies: [
        { name: 'db', status: 'down', detail: 'timeout' },
        { name: 'cache', status: 'down' },
      ],
    })
    expect(r.alert).toBe(true)
    expect(r.summary).toBe('db: timeout; cache: down')
  })

  it('alerts on a non-critical down even if overall healthy', () => {
    const r = healthAlert({
      healthy: true,
      dependencies: [{ name: 'mailer', status: 'down', detail: 'x' }],
    })
    expect(r.alert).toBe(true)
  })
})
