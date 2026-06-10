// E2E (failure / recovery path) — the deny half of the full attestation flow: snapshot a release
// set, validate it, validate a TAMPERED consumer adoption, fold ALL findings into a single decide()
// verdict. A forged vendored tarball whose internal manifest contradicts the lock must propagate a
// blocker the whole way to a deny decision — the shippable verdict a gate consumes to refuse the
// release. Exercises the same create → validate → decide chain as the happy path, end to end, over
// the in-memory host, but asserts the negative terminal state.
import { describe, it, expect } from 'vitest'
import { createReleaseSet, validateReleaseSet } from '../release-set'
import { validateAdoption, discoverConsumerManifests } from '../adoption'
import { decide } from '../decide'
import { memHost, pkgJson } from './host.fixture'
import type { AdoptionRecord, ReleaseFinding, ReleaseSubject } from '../types'

const at = '2026-06-08T00:00:00.000Z'
const subject: ReleaseSubject = { type: 'release_set', id: 'baseline@2026.06.0' }

const sysWorkspace = {
  'packages/canon/package.json': pkgJson('@sys/canon', '1.1.0'),
}

function attest(productFiles: Record<string, string>, tarballs: Parameters<typeof memHost>[1], lock: AdoptionRecord) {
  const sysHost = memHost({ ...sysWorkspace })
  const set = createReleaseSet({
    host: sysHost,
    name: 'baseline',
    version: '2026.06.0',
    status: 'live',
    evidence: [{ source: 'pnpm-check', ref: 'passed' }],
  })
  const productHost = memHost(productFiles, tarballs)
  const findings: ReleaseFinding[] = [
    ...validateReleaseSet({ set, host: sysHost }),
    ...validateAdoption({ lock, manifests: discoverConsumerManifests(productHost), host: productHost, releaseSet: set }),
  ]
  return decide({ subject, findings, decidedAt: at, evidence: set.evidence })
}

describe('e2e (failure): a tarball that does not match the lock attests DENY', () => {
  it('a metadata version mismatch propagates a blocker all the way to a deny decision', () => {
    const decision = attest(
      {
        'package.json': JSON.stringify({
          name: 'qarar',
          dependencies: { '@sys/canon': 'file:vendor/sys-canon-1.1.0.tgz' },
        }),
      },
      { 'vendor/sys-canon-1.1.0.tgz': { name: '@sys/canon', version: '0.0.1' } }, // forged: filename lies
      { schema_version: 1, product: 'qarar', adopts: { release_set: 'baseline@2026.06.0' }, packages: { '@sys/canon': '1.1.0' } },
    )
    expect(decision.decision).toBe('deny')
    expect(decision.reasons.some((r) => r.code === 'adoption_package_version_mismatch' && r.severity === 'blocker')).toBe(true)
    expect(decision.subject).toEqual(subject)
  })

  it('an unreadable (missing) vendored tarball denies the whole attestation, not just warns', () => {
    const decision = attest(
      {
        'package.json': JSON.stringify({
          name: 'qarar',
          dependencies: { '@sys/canon': 'file:vendor/sys-canon-1.1.0.tgz' },
        }),
      },
      {}, // tarball referenced by the file: dep is absent — cannot be vouched for
      { schema_version: 1, product: 'qarar', adopts: { release_set: 'baseline@2026.06.0' }, packages: { '@sys/canon': '1.1.0' } },
    )
    expect(decision.decision).toBe('deny')
    expect(decision.reasons.some((r) => r.code === 'tarball_unreadable' && r.severity === 'blocker')).toBe(true)
  })
})
