import { describe, it, expect } from 'vitest'
import { validateAdoption, discoverConsumerManifests } from '../adoption'
import { parseAdoptionRecord } from '../schemas'
import { memHost } from './host.fixture'
import type { AdoptionRecord, ReleaseFinding } from '../types'

const lock: AdoptionRecord = {
  schema_version: 1,
  product: 'qarar',
  adopts: { release_set: 'baseline@2026.06.0' },
  packages: { '@sys/canon': '1.1.0' },
}

const rootPkg = (deps: Record<string, string>): Record<string, string> => ({
  'package.json': JSON.stringify({ name: 'qarar', dependencies: deps }),
})

const codes = (f: ReleaseFinding[]): string[] => f.map((x) => x.code)

describe('validateAdoption — vendored tarballs', () => {
  it('passes when the tarball metadata matches the lock', () => {
    const host = memHost(rootPkg({ '@sys/canon': 'file:vendor/sys-canon-1.1.0.tgz' }), {
      'vendor/sys-canon-1.1.0.tgz': { name: '@sys/canon', version: '1.1.0' },
    })
    expect(validateAdoption({ lock, manifests: discoverConsumerManifests(host), host })).toEqual([])
  })

  it('flags the headline case: filename says 1.1.0 but tarball metadata is 0.0.1', () => {
    const host = memHost(rootPkg({ '@sys/canon': 'file:vendor/sys-canon-1.1.0.tgz' }), {
      'vendor/sys-canon-1.1.0.tgz': { name: '@sys/canon', version: '0.0.1' },
    })
    const findings = validateAdoption({ lock, manifests: discoverConsumerManifests(host), host })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.code).toBe('adoption_package_version_mismatch')
    expect(findings[0]?.severity).toBe('blocker')
  })

  it('flags an unreadable / missing tarball', () => {
    const host = memHost(rootPkg({ '@sys/canon': 'file:vendor/sys-canon-1.1.0.tgz' }))
    expect(
      codes(validateAdoption({ lock, manifests: discoverConsumerManifests(host), host })),
    ).toContain('tarball_unreadable')
  })
})

describe('validateAdoption — gap A: multi-manifest discovery', () => {
  it('resolves a dep declared in a SUB-package, not the root (file: relative to that dir)', () => {
    const host = memHost(
      {
        'package.json': JSON.stringify({ name: 'qarar' }),
        'packages/shared/package.json': JSON.stringify({
          name: '@qarar/shared',
          dependencies: { '@sys/canon': 'file:../../vendor/sys-canon-1.1.0.tgz' },
        }),
      },
      { 'vendor/sys-canon-1.1.0.tgz': { name: '@sys/canon', version: '1.1.0' } },
    )
    // root-only would report adoption_package_missing; multi-manifest resolves it.
    expect(validateAdoption({ lock, manifests: discoverConsumerManifests(host), host })).toEqual([])
  })

  it('still flags a package no manifest declares', () => {
    const host = memHost({ 'package.json': JSON.stringify({ name: 'qarar' }) })
    expect(
      codes(validateAdoption({ lock, manifests: discoverConsumerManifests(host), host })),
    ).toContain('adoption_package_missing')
  })
})

describe('validateAdoption — gap B: transitive resolvability', () => {
  const govLock: AdoptionRecord = {
    schema_version: 1,
    product: 'qarar',
    packages: { '@eng/governance': '1.0.0' },
  }
  const govTarball = {
    'vendor/eng-governance-1.0.0.tgz': {
      name: '@eng/governance',
      version: '1.0.0',
      dependencies: { '@sys/canon': '1.0.0', zod: '^4.3.6' },
    },
  }

  it('warns when a vendored tarball needs an internal dep the consumer cannot resolve', () => {
    const host = memHost(
      rootPkg({ '@eng/governance': 'file:vendor/eng-governance-1.0.0.tgz' }),
      govTarball,
    )
    const findings = validateAdoption({ lock: govLock, manifests: discoverConsumerManifests(host), host })
    expect(codes(findings)).toContain('tarball_dep_unsatisfiable')
    expect(findings.find((f) => f.code === 'tarball_dep_unsatisfiable')?.severity).toBe('warning')
  })

  it('is satisfied when a pnpm.overrides covers the transitive dep', () => {
    const host = memHost(
      rootPkg({ '@eng/governance': 'file:vendor/eng-governance-1.0.0.tgz' }),
      govTarball,
    )
    const overrides = { '@sys/canon': 'file:vendor/sys-canon-1.0.0.tgz' }
    expect(
      codes(validateAdoption({ lock: govLock, manifests: discoverConsumerManifests(host), host, overrides })),
    ).not.toContain('tarball_dep_unsatisfiable')
  })

  it('is satisfied when the consumer declares the transitive dep as a REGISTRY range', () => {
    const host = memHost(
      rootPkg({
        '@eng/governance': 'file:vendor/eng-governance-1.0.0.tgz',
        '@sys/canon': '^1.0.0', // a registry spec pnpm can fetch — satisfies the transitive
      }),
      govTarball,
    )
    expect(
      codes(validateAdoption({ lock: govLock, manifests: discoverConsumerManifests(host), host })),
    ).not.toContain('tarball_dep_unsatisfiable')
  })

  it('STILL warns when the transitive dep is only a file: tarball (the exact Qarar 404)', () => {
    const host = memHost(
      rootPkg({
        '@eng/governance': 'file:vendor/eng-governance-1.0.0.tgz',
        '@sys/canon': 'file:vendor/sys-canon-1.0.0.tgz', // file: does NOT satisfy a transitive registry spec
      }),
      {
        ...govTarball,
        'vendor/sys-canon-1.0.0.tgz': { name: '@sys/canon', version: '1.0.0' },
      },
    )
    expect(
      codes(validateAdoption({ lock: govLock, manifests: discoverConsumerManifests(host), host })),
    ).toContain('tarball_dep_unsatisfiable')
  })
})

describe('validateAdoption — release set + modes', () => {
  it('cross-checks the release set when provided', () => {
    const host = memHost(rootPkg({ '@sys/canon': 'file:vendor/sys-canon-1.1.0.tgz' }), {
      'vendor/sys-canon-1.1.0.tgz': { name: '@sys/canon', version: '1.1.0' },
    })
    const releaseSet = {
      schema_version: 1 as const,
      name: 'baseline',
      version: '2026.06.0',
      status: 'live' as const,
      packages: { '@sys/canon': '1.0.0' },
      evidence: [],
    }
    expect(
      codes(validateAdoption({ lock, manifests: discoverConsumerManifests(host), host, releaseSet })),
    ).toContain('release_set_version_mismatch')
  })

  it('warns on an invalid adoption mode', () => {
    const host = memHost(rootPkg({ '@sys/canon': 'file:vendor/sys-canon-1.1.0.tgz' }), {
      'vendor/sys-canon-1.1.0.tgz': { name: '@sys/canon', version: '1.1.0' },
    })
    const bad = { ...lock, modes: { '@sys/assay.coverage': 'loud' as unknown as 'warn' } }
    expect(
      codes(validateAdoption({ lock: bad, manifests: discoverConsumerManifests(host), host })),
    ).toContain('invalid_adoption_mode')
  })
})

describe('parseAdoptionRecord', () => {
  it('accepts a well-formed lock', () => {
    expect(() => parseAdoptionRecord(lock)).not.toThrow()
  })
})
