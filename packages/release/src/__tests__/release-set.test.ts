import { describe, it, expect } from 'vitest'
import { createReleaseSet, validateReleaseSet } from '../release-set'
import { parseReleaseSet } from '../schemas'
import { memHost, pkgJson } from './host.fixture'

const workspace = {
  'packages/canon/package.json': pkgJson('@sys/canon', '1.0.0'),
  'packages/governance/package.json': pkgJson('@eng/governance', '1.0.0'),
  'packages/auth/package.json': pkgJson('@sys/auth', '0.0.1'),
  'packages/secret/package.json': pkgJson('@sys/secret', '9.9.9', true),
}

describe('createReleaseSet', () => {
  it('snapshots publishable versions with provenance, excludes private, and parses', () => {
    const set = createReleaseSet({
      host: memHost({ ...workspace }),
      name: 'baseline',
      version: '2026.06.0',
      status: 'live',
      evidence: [{ source: 'pnpm-check', ref: 'passed' }],
      owner: 'sinuhe',
      approvedBy: 'sinuhe',
    })
    expect(set.status).toBe('live')
    expect(set.packages).toEqual({
      '@sys/canon': '1.0.0',
      '@eng/governance': '1.0.0',
      '@sys/auth': '0.0.1',
    })
    expect(set.packages['@sys/secret']).toBeUndefined()
    expect(set.evidence).toEqual([{ source: 'pnpm-check', ref: 'passed' }])
    expect(set.approved_by).toBe('sinuhe')
    expect(() => parseReleaseSet(set)).not.toThrow()
  })

  it('defaults to draft with empty evidence', () => {
    const set = createReleaseSet({ host: memHost({ ...workspace }), name: 'baseline', version: '2026.06.0' })
    expect(set.status).toBe('draft')
    expect(set.evidence).toEqual([])
  })
})

describe('validateReleaseSet', () => {
  it('passes when the set matches the workspace', () => {
    const host = memHost({ ...workspace })
    const set = createReleaseSet({
      host,
      name: 'baseline',
      version: '2026.06.0',
      status: 'live',
      evidence: [{ source: 'pnpm-check', ref: 'passed' }],
    })
    expect(validateReleaseSet({ set, host })).toEqual([])
  })

  it('flags a version that has drifted (blocker)', () => {
    const host = memHost({ ...workspace })
    const set = parseReleaseSet({
      schema_version: 1,
      name: 'baseline',
      version: '2026.06.0',
      status: 'live',
      packages: { '@sys/canon': '1.1.0' },
      evidence: [{ source: 'pnpm-check', ref: 'passed' }],
    })
    const findings = validateReleaseSet({ set, host })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.code).toBe('release_set_version_mismatch')
    expect(findings[0]?.severity).toBe('blocker')
  })

  it('flags a package not present in the workspace (blocker)', () => {
    const host = memHost({ ...workspace })
    const set = parseReleaseSet({
      schema_version: 1,
      name: 'baseline',
      version: '2026.06.0',
      status: 'live',
      packages: { '@sys/ghost': '1.0.0' },
      evidence: [{ source: 'pnpm-check', ref: 'passed' }],
    })
    expect(validateReleaseSet({ set, host })[0]?.code).toBe('release_set_package_missing')
  })

  it('warns when a live set records no evidence', () => {
    const host = memHost({ ...workspace })
    const set = parseReleaseSet({
      schema_version: 1,
      name: 'b',
      version: '2026.06.0',
      status: 'live',
      packages: {},
      evidence: [],
    })
    const findings = validateReleaseSet({ set, host })
    expect(findings[0]?.code).toBe('evidence_not_recorded')
    expect(findings[0]?.severity).toBe('warning')
  })

  it('flags a set past its expiry when now is provided (freshness)', () => {
    const host = memHost({ ...workspace })
    const set = parseReleaseSet({
      schema_version: 1,
      name: 'baseline',
      version: '2026.06.0',
      status: 'live',
      packages: {},
      evidence: [{ source: 'pnpm-check', ref: 'passed' }],
      expires_at: '2026-01-01T00:00:00.000Z',
    })
    const findings = validateReleaseSet({ set, host, now: '2026-06-08T00:00:00.000Z' })
    expect(findings.map((f) => f.code)).toContain('release_set_stale')
  })
})
