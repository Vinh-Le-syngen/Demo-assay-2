// ADVERSARIAL (protocol-misuse) — a hostile producer/consumer abuses the records' self-description:
// a lock whose declared release_set pointer drifts from the set actually validated, and a workspace
// rewritten AFTER the set was snapshotted. The attestor MUST trust the validated set / on-disk
// workspace over the record's self-reported claim, so both lies surface as blockers and decide DENY.
import { describe, it, expect } from 'vitest'
import { validateAdoption, discoverConsumerManifests } from '../adoption'
import { validateReleaseSet } from '../release-set'
import { decide } from '../decide'
import { memHost, pkgJson } from './host.fixture'
import type { AdoptionRecord, ReleaseFinding, ReleaseSet, ReleaseSubject } from '../types'

const codes = (f: ReleaseFinding[]): string[] => f.map((x) => x.code)
const at = '2026-06-08T00:00:00.000Z'

describe('adversarial (protocol-misuse): drifted release-set claim + post-snapshot workspace tamper', () => {
  it('a lock that adopts a DIFFERENT set name/version than the one validated is flagged, and decides DENY', () => {
    const host = memHost(
      { 'package.json': JSON.stringify({ name: 'qarar', dependencies: { '@sys/canon': 'file:vendor/sys-canon-1.1.0.tgz' } }) },
      { 'vendor/sys-canon-1.1.0.tgz': { name: '@sys/canon', version: '1.1.0' } },
    )
    const releaseSet: ReleaseSet = {
      schema_version: 1,
      name: 'baseline',
      version: '2026.06.0',
      status: 'live',
      packages: { '@sys/canon': '1.1.0' },
      evidence: [{ source: 'pnpm-check', ref: 'passed' }],
    }
    const lock: AdoptionRecord = {
      schema_version: 1,
      product: 'qarar',
      adopts: { release_set: 'baseline@2099.12.9' }, // forged adoption pointer
      packages: { '@sys/canon': '1.1.0' },
    }
    const findings = validateAdoption({ lock, manifests: discoverConsumerManifests(host), host, releaseSet })
    expect(codes(findings)).toContain('adoption_release_set_mismatch')
    const subject: ReleaseSubject = { type: 'adoption', id: 'qarar' }
    expect(decide({ subject, findings, decidedAt: at }).decision).toBe('deny')
  })

  it('tampering with the workspace after snapshot cannot make a pinned set re-validate clean', () => {
    const sysHost = memHost({ 'packages/canon/package.json': pkgJson('@sys/canon', '1.1.0') })
    const set: ReleaseSet = {
      schema_version: 1,
      name: 'baseline',
      version: '2026.06.0',
      status: 'live',
      packages: { '@sys/canon': '1.1.0' },
      evidence: [{ source: 'pnpm-check', ref: 'passed' }],
    }
    // Attacker rewrites the manifest to a version the set never attested to.
    sysHost.writeFile('packages/canon/package.json', pkgJson('@sys/canon', '6.6.6'))
    const findings = validateReleaseSet({ set, host: sysHost })
    expect(codes(findings)).toContain('release_set_version_mismatch')
    expect(findings[0]?.severity).toBe('blocker')
  })
})
