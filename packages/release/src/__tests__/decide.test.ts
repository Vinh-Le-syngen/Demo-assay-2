import { describe, it, expect } from 'vitest'
import { decide } from '../decide'
import type { ReleaseFinding, ReleaseSubject } from '../types'

const subject: ReleaseSubject = { type: 'release_set', id: 'baseline@2026.06.0' }
const at = '2026-06-08T00:00:00.000Z'

describe('decide', () => {
  it('allows when there are no findings', () => {
    const d = decide({ subject, findings: [], decidedAt: at })
    expect(d.decision).toBe('allow')
    expect(d.policyVersion).toBe('release/1')
    expect(d.decidedAt).toBe(at)
  })

  it('denies on a blocker', () => {
    const findings: ReleaseFinding[] = [{ code: 'x', severity: 'blocker', message: 'm' }]
    expect(decide({ subject, findings, decidedAt: at }).decision).toBe('deny')
  })

  it('warns on a warning, but denies it under strict', () => {
    const findings: ReleaseFinding[] = [{ code: 'x', severity: 'warning', message: 'm' }]
    expect(decide({ subject, findings, decidedAt: at }).decision).toBe('warn')
    expect(decide({ subject, findings, decidedAt: at, strict: true }).decision).toBe('deny')
  })

  it('carries reasons + evidence through', () => {
    const d = decide({
      subject,
      findings: [{ code: 'x', severity: 'info', message: 'm' }],
      decidedAt: at,
      evidence: [{ source: 'pnpm-check', ref: 'passed' }],
    })
    expect(d.reasons).toHaveLength(1)
    expect(d.evidence).toEqual([{ source: 'pnpm-check', ref: 'passed' }])
  })
})
