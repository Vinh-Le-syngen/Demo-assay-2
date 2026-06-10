// E2E (happy + failure path) — the full attestation flow a release run performs: snapshot a
// release set from the workspace, validate it, validate the consumer's adoption, fold ALL
// findings into a single decide() verdict. The decision (allow / deny) is the shippable
// artifact a gate consumes; this asserts the whole create → validate → decide chain produces a
// plausible attestation over the in-memory host for both a clean run and a tampered one.
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

describe('e2e (happy): a coherent release + adoption attests ALLOW', () => {
  it('clean set + matching vendored tarball yields an allow decision carrying evidence', () => {
    const decision = attest(
      {
        'package.json': JSON.stringify({
          name: 'qarar',
          dependencies: { '@sys/canon': 'file:vendor/sys-canon-1.1.0.tgz' },
        }),
      },
      { 'vendor/sys-canon-1.1.0.tgz': { name: '@sys/canon', version: '1.1.0' } },
      { schema_version: 1, product: 'qarar', adopts: { release_set: 'baseline@2026.06.0' }, packages: { '@sys/canon': '1.1.0' } },
    )
    expect(decision.decision).toBe('allow')
    expect(decision.reasons).toEqual([])
    expect(decision.evidence).toEqual([{ source: 'pnpm-check', ref: 'passed' }])
    expect(decision.policyVersion).toBe('release/1')
  })
})
