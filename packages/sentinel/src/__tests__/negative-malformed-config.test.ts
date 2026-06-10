// @assay area=sentinel category=negative subtype.kind=input-validation risk=medium author=infra
// Negative: degenerate / malformed sentinel configs and probe inputs that the harness must handle
// gracefully without throwing — empty probe set, a `critical` name that matches no probe, an empty
// required-var list in checkConfig, and a healthAlert fed a report with no dependencies. These are
// the malformed-but-typed edges a project can produce by mis-wiring config. Real exported APIs only
// (runHealth, healthAlert, checkConfig).

import { describe, it, expect, afterEach } from 'vitest'
import { runHealth, healthAlert } from '../core'
import { checkConfig } from '../probes'

const TOUCHED = ['SENTINEL_NEG_X']
afterEach(() => TOUCHED.forEach((v) => delete process.env[v]))

describe('runHealth — degenerate configs', () => {
  it('treats an empty probe set as vacuously healthy (no deps, no alert)', async () => {
    const report = await runHealth({ probes: [] })
    expect(report).toEqual({ healthy: true, dependencies: [] })
    expect(healthAlert(report)).toEqual({ alert: false, summary: 'healthy' })
  })

  it('ignores a `critical` name that matches no probe instead of throwing', async () => {
    const report = await runHealth({
      probes: [{ name: 'db', status: 'up', run: () => ({ name: 'db', status: 'up' }) } as never],
      // 'ghost' is critical but has no probe — must not make the system unhealthy.
      critical: ['ghost'],
    })
    expect(report.healthy).toBe(true)
  })
})

describe('checkConfig / healthAlert — malformed inputs', () => {
  it('checkConfig with an empty var list reports not_configured (missing.length === vars.length === 0)', () => {
    // Edge: with zero required vars the "all missing" branch wins, yielding not_configured rather
    // than a misleading up. Pinning the actual contract for a degenerate var list.
    expect(checkConfig('svc', [])).toMatchObject({ name: 'svc', status: 'not_configured' })
  })

  it('healthAlert on an unhealthy report with no down deps gives the generic unhealthy summary', () => {
    // Malformed-but-typed: healthy=false yet no dependency is 'down' (e.g. only not_configured).
    const r = healthAlert({
      healthy: false,
      dependencies: [{ name: 'svc', status: 'not_configured' }],
    })
    expect(r).toEqual({ alert: true, summary: 'unhealthy (critical dependency down)' })
  })

  it('healthAlert on an empty report is silent', () => {
    expect(healthAlert({ healthy: true, dependencies: [] })).toEqual({
      alert: false,
      summary: 'healthy',
    })
  })
})
