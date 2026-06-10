import { describe, it, expect } from 'vitest'
import { discoverWorkspacePackages } from '../workspace'
import { memHost, pkgJson } from './host.fixture'

describe('discoverWorkspacePackages', () => {
  it('reads name/version/private and ignores non-manifest files', () => {
    const host = memHost({
      'packages/canon/package.json': pkgJson('@sys/canon', '1.0.0'),
      'packages/canon/README.md': '# canon',
      'packages/secret/package.json': pkgJson('@sys/secret', '9.9.9', true),
      'packages/nested/deep/package.json': pkgJson('@sys/nope', '1.0.0'),
    })
    const pkgs = discoverWorkspacePackages(host)
    expect(pkgs.map((p) => p.name)).toEqual(['@sys/canon', '@sys/secret'])
    expect(pkgs.find((p) => p.name === '@sys/secret')?.private).toBe(true)
    expect(pkgs.find((p) => p.name === '@sys/canon')?.path).toBe('packages/canon')
  })

  it('skips manifests that do not parse', () => {
    const host = memHost({ 'packages/broken/package.json': '{ not json' })
    expect(discoverWorkspacePackages(host)).toEqual([])
  })
})
