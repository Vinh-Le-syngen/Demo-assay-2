import { describe, it, expect } from 'vitest'
import { defineAssay, type TestManifest } from '../config'
import { audit, isFatal, coverageMatrix, findingsForGate, type AssayHost } from '../engine'
import { CATEGORIES, TAXONOMY } from '../taxonomy'

// In-memory host: a map of relative path -> contents. listFiles returns keys under roots.
function memHost(files: Record<string, string>): AssayHost {
  return {
    listFiles(roots) {
      return Object.keys(files).filter((p) => roots.some((r) => p.startsWith(r + '/') || p.startsWith(r)))
    },
    readFile(p) {
      return p in files ? files[p]! : null
    },
  }
}

const GOOD = 'it("x", () => { expect(1 + 1).toBe(2) })'
const config = defineAssay({ testRoots: ['src'] })

describe('taxonomy data', () => {
  it('is the canonical 12-category vocabulary with cadre provenance', () => {
    expect(CATEGORIES).toHaveLength(12)
    expect(CATEGORIES).toContain('adversarial')
    expect(TAXONOMY.schema_version).toBe(2)
    expect(TAXONOMY.provenance).toMatchObject({ source: 'cadre-os', source_schema_version: 3 })
  })

  it('every category declares a layer, default planes, and allowed authors', () => {
    for (const cat of CATEGORIES) {
      const spec = TAXONOMY.categories[cat]
      expect(spec.defaultPlanes.length).toBeGreaterThan(0)
      expect(spec.allowedAuthors.length).toBeGreaterThan(0)
    }
  })
})

describe('classification gate', () => {
  it('rejects a subtype value not in the category axis', () => {
    const host = memHost({ 'src/a.test.ts': GOOD })
    const m: TestManifest = { tests: [{ path: 'src/a.test.ts', category: 'unit', subtypes: { kind: 'nope' } }] }
    const r = audit(config, m, host)
    expect(findingsForGate(r, 'validClassification').map((f) => f.code)).toContain('invalid-subtype')
    expect(isFatal(r)).toBe(true)
  })

  it('accepts e2e two-axis subtypes', () => {
    const host = memHost({ 'src/e.test.ts': GOOD })
    const m: TestManifest = {
      tests: [{ path: 'src/e.test.ts', category: 'e2e', subtypes: { path_kind: 'happy', profile_kind: 'smoke' } }],
    }
    const r = audit(config, m, host)
    expect(findingsForGate(r, 'validClassification').filter((f) => f.severity === 'fatal')).toHaveLength(0)
  })

  it('warns (not fatal) when axes exist but no subtype is declared', () => {
    const host = memHost({ 'src/a.test.ts': GOOD })
    const r = audit(config, { tests: [{ path: 'src/a.test.ts', category: 'unit' }] }, host)
    expect(findingsForGate(r, 'validClassification').map((f) => f.code)).toContain('missing-subtype')
    expect(isFatal(r)).toBe(false)
  })

  it('flags subtracting a default plane without a reason, allows adding planes', () => {
    const host = memHost({ 'src/a.test.ts': GOOD, 'src/b.test.ts': GOOD })
    const r = audit(config, {
      tests: [
        { path: 'src/a.test.ts', category: 'unit', subtypes: { kind: 'pure' }, planes: [] },
        { path: 'src/b.test.ts', category: 'unit', subtypes: { kind: 'pure' }, planes: ['execution', 'data'] },
      ],
    }, host)
    const codes = findingsForGate(r, 'validClassification').filter((f) => f.severity === 'fatal').map((f) => f.code)
    expect(codes).toContain('plane-subtraction-no-reason')
    expect(codes.filter((c) => c === 'plane-subtraction-no-reason')).toHaveLength(1) // only the subtractor
  })
})

describe('author-separation gate', () => {
  it('requires an author on governance-sensitive categories', () => {
    const host = memHost({ 'src/g.test.ts': GOOD })
    const r = audit(config, { tests: [{ path: 'src/g.test.ts', category: 'governance', subtypes: { kind: 'process' } }] }, host)
    expect(findingsForGate(r, 'authorSeparation').map((f) => f.code)).toContain('author-required')
    expect(isFatal(r)).toBe(true)
  })

  it('rejects an author role not allowed for the category', () => {
    const host = memHost({ 'src/g.test.ts': GOOD })
    const r = audit(config, {
      tests: [{ path: 'src/g.test.ts', category: 'governance', author: 'infra', subtypes: { kind: 'process' } }],
    }, host)
    expect(findingsForGate(r, 'authorSeparation').map((f) => f.code)).toContain('author-role-not-allowed')
  })

  it('requires a reviewer distinct from author on high-risk governance-sensitive tests', () => {
    const host = memHost({ 'src/a.test.ts': GOOD, 'src/b.test.ts': GOOD })
    const r = audit(config, {
      tests: [
        { path: 'src/a.test.ts', category: 'adversarial', author: 'qa', risk: 'high', triggers: ['ci'], subtypes: { kind: 'protocol-misuse' } },
        { path: 'src/b.test.ts', category: 'adversarial', author: 'qa', reviewer: 'qa', risk: 'high', triggers: ['ci'], subtypes: { kind: 'protocol-misuse' } },
      ],
    }, host)
    const codes = findingsForGate(r, 'authorSeparation').map((f) => f.code)
    expect(codes).toContain('reviewer-required') // a: no reviewer
    expect(codes).toContain('reviewer-not-independent') // b: reviewer === author
  })

  it('leaves normal categorized tests lightweight (no author needed)', () => {
    const host = memHost({ 'src/u.test.ts': GOOD })
    const r = audit(config, { tests: [{ path: 'src/u.test.ts', category: 'unit', subtypes: { kind: 'pure' } }] }, host)
    expect(findingsForGate(r, 'authorSeparation')).toHaveLength(0)
  })
})

describe('coverage gate', () => {
  const covConfig = defineAssay({
    testRoots: ['src'],
    gates: { coverage: true },
    coverage: { profile: 'virtual', areaProfiles: { auth: 'lightweight' } },
  })

  it('flags an area missing a required category, counting only present tests', () => {
    const host = memHost({ 'src/auth/u.test.ts': GOOD }) // has unit, missing regression
    const r = audit(covConfig, {
      tests: [{ path: 'src/auth/u.test.ts', area: 'auth', category: 'unit', subtypes: { kind: 'pure' } }],
    }, host)
    const gaps = findingsForGate(r, 'coverage').map((f) => f.category)
    expect(gaps).toContain('regression')
    expect(gaps).not.toContain('unit')
    expect(isFatal(r)).toBe(true)
  })

  it('does not let a stale (declared but missing) test satisfy coverage', () => {
    const host = memHost({ 'src/auth/u.test.ts': GOOD }) // regression file absent
    const r = audit(covConfig, {
      tests: [
        { path: 'src/auth/u.test.ts', area: 'auth', category: 'unit', subtypes: { kind: 'pure' } },
        { path: 'src/auth/gone.test.ts', area: 'auth', category: 'regression', subtypes: { kind: 'behavioral' } },
      ],
    }, host)
    expect(findingsForGate(r, 'coverage').map((f) => f.category)).toContain('regression') // present=0 though declared=1
  })

  it('respects a justified override that waives a required category', () => {
    const cfg = defineAssay({
      testRoots: ['src'],
      gates: { coverage: true },
      coverage: {
        profile: 'virtual',
        areaProfiles: { auth: 'lightweight' },
        overrides: { auth: { regression: { required: false, reason: 'no regressions logged yet' } } },
      },
    })
    const host = memHost({ 'src/auth/u.test.ts': GOOD })
    const r = audit(cfg, { tests: [{ path: 'src/auth/u.test.ts', area: 'auth', category: 'unit', subtypes: { kind: 'pure' } }] }, host)
    expect(findingsForGate(r, 'coverage')).toHaveLength(0)
    expect(isFatal(r)).toBe(false)
  })

  it('coverageMatrix reports declared vs present', () => {
    const host = memHost({ 'src/auth/u.test.ts': GOOD })
    const rows = coverageMatrix(covConfig, {
      tests: [
        { path: 'src/auth/u.test.ts', area: 'auth', category: 'unit' },
        { path: 'src/auth/gone.test.ts', area: 'auth', category: 'regression' },
      ],
    }, new Set(['src/auth/u.test.ts']))
    const reg = rows.find((r) => r.area === 'auth' && r.category === 'regression')!
    expect(reg).toMatchObject({ declared: 1, present: 0, met: false })
  })
})

describe('experimental categories', () => {
  it('warns (not fatal) on a registered x-local-* category and never counts it in coverage', () => {
    const cfg = defineAssay({
      testRoots: ['src'],
      gates: { coverage: true },
      taxonomy: { experimentalCategories: ['x-local-fuzz'] },
      coverage: { profile: 'lightweight', areaProfiles: { fz: 'lightweight' } },
    })
    const host = memHost({ 'src/f.test.ts': GOOD })
    const r = audit(cfg, { tests: [{ path: 'src/f.test.ts', area: 'fz', category: 'x-local-fuzz' }] }, host)
    expect(findingsForGate(r, 'validClassification').map((f) => f.code)).toContain('experimental-category')
    expect(findingsForGate(r, 'validClassification').find((f) => f.code === 'experimental-category')!.severity).toBe('warn')
    // counted toward coverage? no — the lightweight floor (unit, regression) is unmet by an x-local test
    expect(findingsForGate(r, 'coverage').map((f) => f.category).sort()).toEqual(['regression', 'unit'])
  })

  it('treats an unregistered x-local-* category as a fatal unknown', () => {
    const host = memHost({ 'src/f.test.ts': GOOD })
    const r = audit(config, { tests: [{ path: 'src/f.test.ts', category: 'x-local-nope' }] }, host)
    expect(findingsForGate(r, 'validClassification').map((f) => f.code)).toContain('unknown-category')
    expect(isFatal(r)).toBe(true)
  })
})

describe('backward compatibility', () => {
  it('a pre-taxonomy manifest (path only) still passes all new gates', () => {
    const host = memHost({ 'src/a.test.ts': GOOD })
    const r = audit(config, { tests: [{ path: 'src/a.test.ts' }] }, host)
    expect(isFatal(r)).toBe(false)
    expect(findingsForGate(r, 'validClassification')).toHaveLength(0)
    expect(findingsForGate(r, 'authorSeparation')).toHaveLength(0)
  })

  it('risk:critical with no trigger trips the high-risk gate', () => {
    const host = memHost({ 'src/a.test.ts': GOOD })
    const r = audit(config, { tests: [{ path: 'src/a.test.ts', risk: 'critical' }] }, host)
    expect(findingsForGate(r, 'requireTriggerForHighRisk').map((f) => f.path)).toEqual(['src/a.test.ts'])
  })
})
