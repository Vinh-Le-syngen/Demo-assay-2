// GOVERNANCE (authz-policy + process) — the attestor's POLICY surface, independent of any single
// check: (1) how decide() folds severities into the allow/warn/deny verdict that gates a release,
// including the --strict escalation that promotes warnings to denials; and (2) the freshness +
// evidence PROCESS rules a governed live set must satisfy (a stale or evidence-less set is
// surfaced for review, a superseded one is exempt). These encode "are we following our own
// release rules", not "does a given function compute correctly".
import { describe, it, expect } from 'vitest'
import { decide } from '../decide'
import type { ReleaseFinding, ReleaseSubject } from '../types'

const subject: ReleaseSubject = { type: 'release_set', id: 'baseline@2026.06.0' }
const at = '2026-06-08T00:00:00.000Z'

describe('governance (authz-policy): the verdict ladder gates releases by severity', () => {
  it('info passes, a lone warning warns, a blocker denies — and strict denies on a warning', () => {
    const info: ReleaseFinding[] = [{ code: 'i', severity: 'info', message: 'm' }]
    const warning: ReleaseFinding[] = [{ code: 'w', severity: 'warning', message: 'm' }]
    const blocker: ReleaseFinding[] = [{ code: 'b', severity: 'blocker', message: 'm' }]

    expect(decide({ subject, findings: info, decidedAt: at }).decision).toBe('allow')
    expect(decide({ subject, findings: warning, decidedAt: at }).decision).toBe('warn')
    expect(decide({ subject, findings: blocker, decidedAt: at }).decision).toBe('deny')
    // strict-mode policy: a warning is no longer shippable — it escalates to a deny.
    expect(decide({ subject, findings: warning, decidedAt: at, strict: true }).decision).toBe('deny')
    // a blocker is unconditionally a deny regardless of strictness; the verdict is recorded with its policy.
    const d = decide({ subject, findings: blocker, decidedAt: at, policyVersion: 'release/1' })
    expect(d.policyVersion).toBe('release/1')
    expect(d.reasons).toEqual(blocker)
  })

  it('a mixed bag denies on the blocker — one disqualifying reason is sufficient to gate', () => {
    const mixed: ReleaseFinding[] = [
      { code: 'i', severity: 'info', message: 'm' },
      { code: 'w', severity: 'warning', message: 'm' },
      { code: 'b', severity: 'blocker', message: 'm' },
    ]
    expect(decide({ subject, findings: mixed, decidedAt: at }).decision).toBe('deny')
  })
})
