// INTEGRATION (intra-system) — exercise the release attestor's components composed over a
// SINGLE in-memory host, the way the CLI would chain them: discover the workspace, snapshot a
// release set, validate it against that same workspace, then validate a product's adoption lock
// against the same set and its vendored tarballs. No component is stubbed — the real
// createReleaseSet / validateReleaseSet / validateAdoption / discoverConsumerManifests collaborate.
import { describe, it, expect } from 'vitest'
import { createReleaseSet, validateReleaseSet } from '../release-set'
import { validateAdoption, discoverConsumerManifests } from '../adoption'
import { memHost, pkgJson } from './host.fixture'
import type { AdoptionRecord } from '../types'

// One workspace shared by the set producer AND the consumer cross-check.
const workspace = {
  'packages/canon/package.json': pkgJson('@sys/canon', '1.1.0'),
  'packages/governance/package.json': pkgJson('@eng/governance', '1.0.0'),
}

describe('integration: create → validate set → validate adoption (intra-system)', () => {
  it('a coherent set + matching lock + matching tarball validate clean end to end', () => {
    // Producer side: the /sys workspace the release set is snapshotted from.
    const sysHost = memHost({ ...workspace })
    const set = createReleaseSet({
      host: sysHost,
      name: 'baseline',
      version: '2026.06.0',
      status: 'live',
      evidence: [{ source: 'pnpm-check', ref: 'passed' }],
    })
    // The set must agree with the workspace it was just snapshotted from.
    expect(validateReleaseSet({ set, host: sysHost })).toEqual([])
    expect(set.packages).toEqual({ '@sys/canon': '1.1.0', '@eng/governance': '1.0.0' })

    // Consumer side: a product that vendors exactly what the set declares.
    const productHost = memHost(
      {
        'package.json': JSON.stringify({
          name: 'qarar',
          dependencies: { '@sys/canon': 'file:vendor/sys-canon-1.1.0.tgz' },
        }),
      },
      { 'vendor/sys-canon-1.1.0.tgz': { name: '@sys/canon', version: '1.1.0' } },
    )
    const lock: AdoptionRecord = {
      schema_version: 1,
      product: 'qarar',
      adopts: { release_set: 'baseline@2026.06.0' },
      packages: { '@sys/canon': '1.1.0' },
    }
    const findings = validateAdoption({
      lock,
      manifests: discoverConsumerManifests(productHost),
      host: productHost,
      releaseSet: set,
    })
    expect(findings).toEqual([])
  })
})
