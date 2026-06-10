// GOVERNANCE (process) — the freshness + evidence PROCESS rules a governed live set must satisfy,
// independent of any single correctness check: a live/approved set with no recorded evidence is
// surfaced for review (warning), an expired live set is flagged stale, and a superseded set is
// intentionally exempt from the freshness rule because it is no longer the live record. Encodes
// "are we following our own release-governance rules", using the real validateReleaseSet over the
// in-memory host with the clock injected.
import { describe, it, expect } from 'vitest'
import { validateReleaseSet } from '../release-set'
import { memHost } from './host.fixture'
import type { ReleaseSet } from '../types'

const at = '2026-06-08T00:00:00.000Z'
const ws = { 'packages/canon/package.json': JSON.stringify({ name: '@sys/canon', version: '1.0.0' }) }

describe('governance (process): freshness + evidence rules for a governed live set', () => {
  it('a live set with no evidence is surfaced for review (warning), an approved one likewise', () => {
    const base = (status: 'live' | 'approved'): ReleaseSet => ({
      schema_version: 1,
      name: 'b',
      version: '2026.06.0',
      status,
      packages: {},
      evidence: [],
    })
    expect(validateReleaseSet({ set: base('live'), host: memHost({ ...ws }) })[0]?.code).toBe('evidence_not_recorded')
    expect(validateReleaseSet({ set: base('approved'), host: memHost({ ...ws }) })[0]?.code).toBe('evidence_not_recorded')
  })

  it('an expired live set is flagged stale, but a superseded set is exempt from the freshness rule', () => {
    const expired: ReleaseSet = {
      schema_version: 1,
      name: 'b',
      version: '2026.06.0',
      status: 'live',
      packages: {},
      evidence: [{ source: 'pnpm-check', ref: 'passed' }],
      expires_at: '2026-01-01T00:00:00.000Z',
    }
    const live = validateReleaseSet({ set: expired, host: memHost({ ...ws }), now: at })
    expect(live.map((f) => f.code)).toContain('release_set_stale')
    expect(live.find((f) => f.code === 'release_set_stale')?.severity).toBe('warning')

    // Same dates, but superseded sets are intentionally exempt — they are no longer the live record.
    const superseded: ReleaseSet = { ...expired, status: 'superseded', superseded_by: 'baseline@2026.07.0' }
    const after = validateReleaseSet({ set: superseded, host: memHost({ ...ws }), now: at })
    expect(after.map((f) => f.code)).not.toContain('release_set_stale')
  })

  it('a not-yet-expired live set with evidence raises no freshness or evidence finding', () => {
    const fresh: ReleaseSet = {
      schema_version: 1,
      name: 'b',
      version: '2026.06.0',
      status: 'live',
      packages: {},
      evidence: [{ source: 'pnpm-check', ref: 'passed' }],
      expires_at: '2026-12-31T00:00:00.000Z',
    }
    const findings = validateReleaseSet({ set: fresh, host: memHost({ ...ws }), now: at })
    const codes = findings.map((f) => f.code)
    expect(codes).not.toContain('release_set_stale')
    expect(codes).not.toContain('evidence_not_recorded')
  })
})
