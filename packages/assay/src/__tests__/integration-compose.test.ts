// Integration (intra-system): audit() composing all gates over a BROKEN manifest, proving the
// gates accumulate into a single findings list rather than short-circuiting. Split from
// integration.test.ts to keep the integration category at two files; same in-memory host double,
// same `audit` entry point. Author `infra`.

import { describe, it, expect } from 'vitest'
import { defineAssay, type TestManifest } from '../config'
import { audit, isFatal, findingsForGate, type AssayHost } from '../engine'

// In-memory host: relative path -> contents. listFiles returns keys under roots.
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

describe('audit (intra-system integration: gates compose over a broken manifest)', () => {
  it('surfaces findings from multiple distinct gates in one pass over a broken manifest', () => {
    // One manifest that simultaneously trips registry (stale), shells (no-expect),
    // classification (unknown category), and coverage (full floor unmet) — proving the
    // gates compose into a single findings list rather than short-circuiting.
    const cfg = defineAssay({
      testRoots: ['src'],
      gates: { coverage: true },
      coverage: { profile: 'full' },
    })
    const host = memHost({
      'src/real.test.ts': REAL,
      'src/shell.test.ts': 'it("x", () => { const a = 1 })', // no expect -> shell
    })
    const manifest: TestManifest = {
      tests: [
        { path: 'src/real.test.ts', area: 'core', category: 'unit', subtypes: { kind: 'pure' }, author: 'infra' },
        { path: 'src/shell.test.ts', area: 'core', category: 'unit', subtypes: { kind: 'pure' }, author: 'infra' },
        { path: 'src/ghost.test.ts', area: 'core', category: 'unit' }, // stale: not on disk
      ],
    }

    const report = audit(cfg, manifest, host)
    const gatesHit = new Set(report.findings.map((f) => f.gate))

    expect(findingsForGate(report, 'noStale').map((f) => f.path)).toEqual(['src/ghost.test.ts'])
    expect(findingsForGate(report, 'noShells').some((f) => f.code === 'shell-no-expect')).toBe(true)
    expect(gatesHit.has('coverage')).toBe(true) // full floor for 'core' is nowhere near met
    expect(gatesHit.size).toBeGreaterThanOrEqual(3)
    expect(isFatal(report)).toBe(true)
  })
})
