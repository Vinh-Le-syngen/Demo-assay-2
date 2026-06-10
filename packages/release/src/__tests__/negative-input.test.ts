// NEGATIVE (input-validation) — bad/missing inputs must fail correctly, not silently pass. Covers:
// a malformed (unparseable) consumer manifest that drops a declared dependency, and a missing/
// unreadable vendored tarball. (Schema-rejection of structurally-invalid records lives in the
// sibling negative-schema.test.ts.)
import { describe, it, expect } from 'vitest'
import { validateAdoption, discoverConsumerManifests } from '../adoption'
import { memHost } from './host.fixture'
import type { AdoptionRecord, ReleaseFinding } from '../types'

const codes = (f: ReleaseFinding[]): string[] => f.map((x) => x.code)

const lock: AdoptionRecord = {
  schema_version: 1,
  product: 'qarar',
  packages: { '@sys/canon': '1.1.0' },
}

describe('negative (input-validation): malformed / unreadable inputs fail correctly', () => {
  it('a malformed package.json is skipped by discovery, so the lock dep reads as undeclared (blocker)', () => {
    const host = memHost({ 'package.json': '{ this is : not json' })
    const findings = validateAdoption({ lock, manifests: discoverConsumerManifests(host), host })
    expect(codes(findings)).toContain('adoption_package_missing')
    expect(findings.find((f) => f.code === 'adoption_package_missing')?.severity).toBe('blocker')
  })

  it('a file: dep whose tarball is missing is flagged unreadable, not assumed valid', () => {
    const host = memHost({
      'package.json': JSON.stringify({ name: 'qarar', dependencies: { '@sys/canon': 'file:vendor/sys-canon-1.1.0.tgz' } }),
    }) // no tarball registered
    const findings = validateAdoption({ lock, manifests: discoverConsumerManifests(host), host })
    const f = findings.find((x) => x.code === 'tarball_unreadable')
    expect(f?.severity).toBe('blocker')
    expect(f?.path).toBe('vendor/sys-canon-1.1.0.tgz')
  })
})
