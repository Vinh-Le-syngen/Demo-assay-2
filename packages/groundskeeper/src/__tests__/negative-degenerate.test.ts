import { describe, it, expect } from 'vitest'
import {
  defineGroundskeeper,
  runHousekeeping,
  evaluateHousekeeping,
  summarize,
} from '../core'

// Negative (degenerate inputs): empty / contentless inputs to summarize → evaluate must produce
// a stable, no-alert result rather than throwing or false-paging. Pure exported APIs only.
const RAN_AT = '2026-06-03T00:00:00Z'

describe('negative: degenerate summarize/evaluate inputs', () => {
  it('summarize over an empty finding list produces empty counts and zero high', () => {
    const report = summarize([], RAN_AT)
    expect(report.counts).toEqual({})
    expect(report.highCount).toBe(0)
    expect(report.findings).toEqual([])
    expect(evaluateHousekeeping(report).alert).toBe(false)
  })

  it('a config with no detectors yields an empty report and a no-alert decision', async () => {
    const report = await runHousekeeping(defineGroundskeeper({ detectors: [] }), RAN_AT)
    expect(report.ranAt).toBe(RAN_AT)
    expect(report.findings).toEqual([])
    expect(report.counts).toEqual({})
    expect(report.highCount).toBe(0)

    const decision = evaluateHousekeeping(report)
    expect(decision).toMatchObject({ alert: false, level: 'info', highCount: 0 })
    expect(decision.highDetectors).toEqual([])
    expect(decision.summary).toBe('no findings')
  })
})
