// @assay area=sentinel category=integration subtype.kind=intra-system risk=medium author=infra
// Integration: runHealth composing MULTIPLE injected probes the way a project assembles a sentinel
// config — a mix of up / down / not_configured probes, a configured `critical` subset, then the
// derived HealthReport fed into healthAlert. Exercises the full intra-system path
// (probes -> overall health -> alert decision), not a single function in isolation. Real exported
// APIs only (defineSentinel, runHealth, healthAlert, configProbe); probes are the injection point
// the harness is designed to consume.

import { describe, it, expect, afterEach } from 'vitest'
import { defineSentinel, runHealth, healthAlert, type Probe, type DepStatus } from '../core'
import { configProbe } from '../probes'

const fixed = (s: DepStatus): Probe => ({ name: s.name, run: () => s })
const asyncFixed = (s: DepStatus): Probe => ({ name: s.name, run: async () => s })

const ENV = ['SENTINEL_IT_API_KEY']
afterEach(() => ENV.forEach((v) => delete process.env[v]))

describe('runHealth + healthAlert — multi-probe composition', () => {
  it('composes mixed probes, derives overall health from the critical subset, and alerts on the down offender', async () => {
    process.env.SENTINEL_IT_API_KEY = 'present'
    const config = defineSentinel({
      probes: [
        fixed({ name: 'db', status: 'up' }),
        asyncFixed({ name: 'cache', status: 'down', detail: 'timeout' }),
        configProbe('payments', ENV), // present -> up
        fixed({ name: 'analytics', status: 'not_configured' }),
      ],
      // cache is critical -> a down here makes the whole system unhealthy; analytics is not critical.
      critical: ['db', 'cache', 'payments'],
    })

    const report = await runHealth(config)

    // All probes ran and preserved declaration order.
    expect(report.dependencies.map((d) => d.name)).toEqual(['db', 'cache', 'payments', 'analytics'])
    expect(report.dependencies.map((d) => d.status)).toEqual(['up', 'down', 'up', 'not_configured'])
    // A critical dep is down -> unhealthy.
    expect(report.healthy).toBe(false)

    // Alert decision is derived from the same report and names the offender.
    const alert = healthAlert(report)
    expect(alert.alert).toBe(true)
    expect(alert.summary).toBe('cache: timeout')
  })

  it('stays healthy and silent when every critical probe is up despite a non-critical not_configured probe', async () => {
    const config = defineSentinel({
      probes: [
        fixed({ name: 'db', status: 'up' }),
        asyncFixed({ name: 'queue', status: 'up' }),
        fixed({ name: 'analytics', status: 'not_configured' }),
      ],
      critical: ['db', 'queue'],
    })

    const report = await runHealth(config)
    expect(report.healthy).toBe(true)

    // not_configured is not 'down', so healthAlert stays silent on an otherwise-healthy report.
    const alert = healthAlert(report)
    expect(alert).toEqual({ alert: false, summary: 'healthy' })
  })
})
