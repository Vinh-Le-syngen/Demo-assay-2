import { describe, it, expect } from 'vitest'
import { defineAssay, manifestSchema } from '../config'

describe('defineAssay', () => {
  it('applies defaults around the required testRoots', () => {
    const c = defineAssay({ testRoots: ['apps/api/src'] })
    expect(c.testPattern).toContain('test|spec')
    expect(c.manifestPath).toBe('tests/manifest.json')
    expect(c.gates).toEqual({
      noUntracked: true,
      noStale: true,
      requireTriggerForHighRisk: true,
      noShells: true,
      validClassification: true,
      authorSeparation: true,
      coverage: false,
    })
    expect(c.coverage.profile).toBe('virtual')
    expect(c.taxonomy.experimentalCategories).toEqual([])
  })

  it('rejects a non-canonical category and an unknown risk in the manifest', () => {
    expect(() => manifestSchema.parse({ tests: [{ path: 'a.test.ts', category: 'bogus' }] })).toThrow()
    expect(() => manifestSchema.parse({ tests: [{ path: 'a.test.ts', risk: 'spicy' }] })).toThrow()
    expect(() =>
      manifestSchema.parse({ tests: [{ path: 'a.test.ts', category: 'unit', author: 'infra' }] }),
    ).not.toThrow()
  })

  it('requires at least one test root', () => {
    expect(() => defineAssay({ testRoots: [] })).toThrow()
  })

  it('validates a manifest shape', () => {
    expect(() =>
      manifestSchema.parse({ tests: [{ path: 'a.test.ts', risk: 'high', triggers: ['ci'] }] }),
    ).not.toThrow()
    expect(() => manifestSchema.parse({ tests: [{ risk: 'high' }] })).toThrow()
  })
})
