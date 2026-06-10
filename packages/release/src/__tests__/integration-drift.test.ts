// INTEGRATION (intra-system) — the drift half of the pipeline: a release set snapshotted from a
// /sys workspace must STOP agreeing with that workspace the moment the workspace moves underneath
// it. Composes the real createReleaseSet → validateReleaseSet over a single in-memory host the way
// the CLI would, with no component stubbed, and asserts the cross-check surfaces the drift as a
// blocker rather than silently re-validating clean.
import { describe, it, expect } from 'vitest'
import { createReleaseSet, validateReleaseSet } from '../release-set'
import { memHost, pkgJson } from './host.fixture'

const workspace = {
  'packages/canon/package.json': pkgJson('@sys/canon', '1.1.0'),
  'packages/governance/package.json': pkgJson('@eng/governance', '1.0.0'),
}

describe('integration: snapshot → workspace drift → re-validate (intra-system)', () => {
  it('a single workspace drift surfaces as a blocker on the set side and stops a clean attestation', () => {
    const sysHost = memHost({ ...workspace })
    const set = createReleaseSet({
      host: sysHost,
      name: 'baseline',
      version: '2026.06.0',
      status: 'live',
      evidence: [{ source: 'pnpm-check', ref: 'passed' }],
    })
    // Workspace moves AFTER the snapshot — canon bumped, set now stale relative to /sys.
    sysHost.writeFile('packages/canon/package.json', pkgJson('@sys/canon', '1.2.0'))
    const findings = validateReleaseSet({ set, host: sysHost })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.code).toBe('release_set_version_mismatch')
    expect(findings[0]?.severity).toBe('blocker')
    expect(findings[0]?.package).toBe('@sys/canon')
  })

  it('a package removed from the workspace after snapshot is flagged, not silently dropped', () => {
    const sysHost = memHost({ ...workspace })
    const set = createReleaseSet({
      host: sysHost,
      name: 'baseline',
      version: '2026.06.0',
      status: 'live',
      evidence: [{ source: 'pnpm-check', ref: 'passed' }],
    })
    expect(set.packages).toEqual({ '@sys/canon': '1.1.0', '@eng/governance': '1.0.0' })
    // governance package disappears from the workspace the set was snapshotted from.
    sysHost.writeFile('packages/governance/package.json', pkgJson('@eng/governance', '2.0.0'))
    const findings = validateReleaseSet({ set, host: sysHost })
    expect(findings.map((f) => f.package)).toContain('@eng/governance')
    expect(findings.every((f) => f.severity === 'blocker')).toBe(true)
  })
})
