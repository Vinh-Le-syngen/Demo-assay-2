// @assay area=sentinel category=integration subtype.kind=intra-system risk=medium author=infra
// Integration: runHealth with NO explicit `critical` set — the documented default ("every probe is
// critical") composed across several injected probes, then routed through healthAlert. Verifies the
// default-criticality contract end-to-end at the system level rather than re-asserting a single
// derivation. Real exported APIs only; probes are the injection seam.

import { describe, it, expect } from 'vitest'
import { defineSentinel, runHealth, healthAlert, type Probe, type DepStatus } from '../core'

const fixed = (s: DepStatus): Probe => ({ name: s.name, run: () => s })

describe('runHealth + healthAlert — default criticality (no critical list)', () => {
  it('treats every probe as critical so any down dep makes the system unhealthy and alert-worthy', async () => {
    const config = defineSentinel({
      probes: [
        fixed({ name: 'db', status: 'up' }),
        fixed({ name: 'mailer', status: 'down', detail: 'smtp 421' }),
        fixed({ name: 'storage', status: 'up' }),
      ],
    })

    const report = await runHealth(config)
    expect(report.dependencies).toHaveLength(3)
    expect(report.healthy).toBe(false)

    const alert = healthAlert(report)
    expect(alert.alert).toBe(true)
    expect(alert.summary).toBe('mailer: smtp 421')
  })

  it('reports healthy with a clean summary when all default-critical probes are up', async () => {
    const config = defineSentinel({
      probes: [
        fixed({ name: 'db', status: 'up' }),
        fixed({ name: 'cache', status: 'up' }),
      ],
    })

    const report = await runHealth(config)
    expect(report.healthy).toBe(true)
    expect(healthAlert(report)).toEqual({ alert: false, summary: 'healthy' })
  })
})
