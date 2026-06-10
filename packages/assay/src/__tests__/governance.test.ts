// Governance (process): the coverage-override and gate-enablement POLICY, viewed as process
// controls rather than individual gate mechanics. Asserts that (a) waiving a required category
// is only possible through the schema's mandatory substantive `reason`, and (b) a justified
// override demotes the requirement without silently hiding the rest of the floor. Author `qa`
// per the governance-sensitive author rule; this complements the file-level author/coverage
// assertions already in taxonomy.test.ts.

import { describe, it, expect } from 'vitest'
import { defineAssay, type TestManifest } from '../config'
import { audit, isFatal, coverageMatrix, findingsForGate, type AssayHost } from '../engine'

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

const REAL = 'it("x", () => { expect(value).toBe(expected) })'

describe('coverage-override governance (process)', () => {
  it('a justified override (required:false + reason) waives exactly that cell, leaving the rest of the floor enforced', () => {
    // Policy: an area can drop a required category only with a substantive reason recorded in
    // config. Here `auth` waives e2e (with reason) but provides nothing else; the matrix must
    // show e2e as not-required-and-met while every other lightweight-floor cell stays required.
    const cfg = defineAssay({
      testRoots: ['src'],
      gates: { coverage: true },
      coverage: {
        profile: 'full',
        areaProfiles: { auth: 'full' },
        overrides: {
          auth: { e2e: { required: false, reason: 'auth e2e is covered by the platform-level smoke suite' } },
        },
      },
    })
    const host = memHost({ 'src/u.test.ts': REAL })
    const manifest: TestManifest = {
      tests: [{ path: 'src/u.test.ts', area: 'auth', category: 'unit', subtypes: { kind: 'pure' }, author: 'infra' }],
    }

    const rows = coverageMatrix(cfg, manifest, new Set(['src/u.test.ts']))
    const e2e = rows.find((r) => r.area === 'auth' && r.category === 'e2e')!
    expect(e2e.required).toBe(false)
    expect(e2e.met).toBe(true) // waived cells never break the build

    // The override is surgical: governance (a different required category) is still enforced and unmet.
    const gaps = findingsForGate(audit(cfg, manifest, host), 'coverage').map((f) => f.category)
    expect(gaps).not.toContain('e2e') // waived
    expect(gaps).toContain('governance') // still required, still gapped
    expect(isFatal(audit(cfg, manifest, host))).toBe(true)
  })

  it('a `min` override raises the bar as a process control, and the coverage gate is inert until explicitly enabled', () => {
    // Two process facts: (1) overrides can tighten (min) a floor, not only relax it; (2) the
    // coverage gate is off by default so a profile upgrade never silently breaks an existing
    // build — it must be opted into via gates.coverage.
    const baseManifest: TestManifest = {
      tests: [{ path: 'src/r.test.ts', area: 'core', category: 'regression', subtypes: { kind: 'behavioral' }, author: 'infra' }],
    }
    const host = memHost({ 'src/r.test.ts': REAL })

    // min:3 on a single declared regression test -> required cell unmet.
    const tightened = defineAssay({
      testRoots: ['src'],
      gates: { coverage: true },
      coverage: {
        profile: 'lightweight',
        areaProfiles: { core: 'lightweight' },
        overrides: { core: { regression: { min: 3, reason: 'core regression must be triple-covered after the S1 incident' } } },
      },
    })
    const tightenedRow = coverageMatrix(tightened, baseManifest, new Set(['src/r.test.ts'])).find(
      (r) => r.area === 'core' && r.category === 'regression',
    )!
    expect(tightenedRow.need).toBe(3)
    expect(tightenedRow.met).toBe(false)
    expect(findingsForGate(audit(tightened, baseManifest, host), 'coverage').some((f) => f.category === 'regression')).toBe(true)

    // Same manifest, coverage gate left at its default (off): no coverage findings at all.
    const gateOff = defineAssay({ testRoots: ['src'], coverage: { profile: 'full' } })
    expect(findingsForGate(audit(gateOff, baseManifest, host), 'coverage')).toHaveLength(0)
  })
})
