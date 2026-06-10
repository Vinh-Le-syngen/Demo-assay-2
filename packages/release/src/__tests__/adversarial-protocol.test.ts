// ADVERSARIAL (protocol-misuse) — a hostile producer/consumer tries to slip an incoherent
// bundle past the attestor by abusing the records' contract: a sys.lock.json that CLAIMS a clean
// version while the actual vendored tarball is forged to a different version, and a lock whose
// declared release_set drifts from the set that was actually validated. The validation MUST
// catch the lie regardless of what the record asserts about itself — the tarball/workspace truth
// wins over the self-reported claim.
import { describe, it, expect } from 'vitest'
import { validateAdoption, discoverConsumerManifests } from '../adoption'
import { memHost } from './host.fixture'
import type { AdoptionRecord, ReleaseFinding } from '../types'

const codes = (f: ReleaseFinding[]): string[] => f.map((x) => x.code)

describe('adversarial (protocol-misuse): forged tarball metadata behind a clean-looking lock', () => {
  it('a lock pinning 1.1.0 cannot be vouched for by a tarball whose internal manifest says 0.0.1', () => {
    // The filename and the lock both say 1.1.0; only the packed metadata betrays the forgery.
    const host = memHost(
      { 'package.json': JSON.stringify({ name: 'qarar', dependencies: { '@sys/canon': 'file:vendor/sys-canon-1.1.0.tgz' } }) },
      { 'vendor/sys-canon-1.1.0.tgz': { name: '@sys/canon', version: '0.0.1' } },
    )
    const lock: AdoptionRecord = { schema_version: 1, product: 'qarar', packages: { '@sys/canon': '1.1.0' } }
    const findings = validateAdoption({ lock, manifests: discoverConsumerManifests(host), host })
    expect(codes(findings)).toContain('adoption_package_version_mismatch')
    expect(findings.find((f) => f.code === 'adoption_package_version_mismatch')?.severity).toBe('blocker')
  })

  it('a tarball whose name is swapped for another package is rejected even if the version matches', () => {
    // protocol-misuse: substitute a wholly different package under the expected file: path.
    const host = memHost(
      { 'package.json': JSON.stringify({ name: 'qarar', dependencies: { '@sys/canon': 'file:vendor/sys-canon-1.1.0.tgz' } }) },
      { 'vendor/sys-canon-1.1.0.tgz': { name: '@sys/impostor', version: '1.1.0' } },
    )
    const lock: AdoptionRecord = { schema_version: 1, product: 'qarar', packages: { '@sys/canon': '1.1.0' } }
    const findings = validateAdoption({ lock, manifests: discoverConsumerManifests(host), host })
    const f = findings.find((x) => x.code === 'tarball_metadata_mismatch')
    expect(f?.severity).toBe('blocker')
    expect(f?.package).toBe('@sys/canon')
  })
})
