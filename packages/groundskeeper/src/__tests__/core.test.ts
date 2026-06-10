import { describe, it, expect } from 'vitest'
import {
  summarize,
  runHousekeeping,
  evaluateHousekeeping,
  defineGroundskeeper,
  type Finding,
} from '../core'

const f = (detector: string, severity: Finding['severity']): Finding => ({
  detector,
  severity,
  subject: 's',
  detail: 'd',
})

describe('summarize', () => {
  it('counts per detector and high severity', () => {
    const r = summarize([f('a', 'high'), f('a', 'warning'), f('b', 'high')], 'T')
    expect(r.counts).toEqual({ a: 2, b: 1 })
    expect(r.highCount).toBe(2)
    expect(r.ranAt).toBe('T')
  })
})

describe('runHousekeeping', () => {
  it('runs all detectors (incl. async) and aggregates', async () => {
    const config = defineGroundskeeper({
      detectors: [
        { name: 'x', run: () => [f('x', 'high')] },
        { name: 'y', run: async () => [f('y', 'warning')] },
      ],
    })
    const r = await runHousekeeping(config, 'T')
    expect(r.findings).toHaveLength(2)
    expect(r.highCount).toBe(1)
  })
})

describe('evaluateHousekeeping', () => {
  it('alerts at error level on high findings, naming detectors', () => {
    const r = summarize([f('expiring', 'high'), f('expiring', 'high'), f('aml', 'high')], 'T')
    const d = evaluateHousekeeping(r)
    expect(d).toMatchObject({ alert: true, level: 'error', highCount: 3 })
    expect(d.highByDetector).toEqual({ expiring: 2, aml: 1 })
    expect(d.summary).toContain('expiring=2')
  })

  it('does not alert when only lower-severity findings', () => {
    const d = evaluateHousekeeping(summarize([f('a', 'warning')], 'T'))
    expect(d).toMatchObject({ alert: false, level: 'info' })
    expect(d.summary).toBe('no high-severity findings (1 lower-severity)')
  })

  it('reports cleanly with no findings', () => {
    expect(evaluateHousekeeping(summarize([], 'T')).summary).toBe('no findings')
  })
})
