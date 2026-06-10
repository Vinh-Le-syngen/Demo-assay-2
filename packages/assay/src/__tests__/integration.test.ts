// Integration (intra-system): audit() composing all gates over a manifest + in-memory host,
// end to end. Exercises the full pipeline — discovery, registry gates, shells, classification,
// authorship, and coverage — through the single public `audit` entry point. No source touched;
// reuses the in-memory host double from the engine test.

import { describe, it, expect } from 'vitest'
import { defineAssay, type TestManifest } from '../config'
import { audit, isFatal, type AssayHost } from '../engine'

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

describe('audit (intra-system integration over all gates)', () => {
  it('passes a fully-classified, coverage-satisfying manifest with every gate enabled', () => {
    // A `full` profile area that genuinely meets the floor (2 each of the required categories),
    // every entry real, registered, on disk, correctly classified and authored.
    const cfg = defineAssay({
      testRoots: ['src'],
      gates: { coverage: true },
      coverage: { profile: 'full' },
    })

    const required = ['unit', 'integration', 'e2e', 'regression', 'negative', 'adversarial', 'governance'] as const
    const subtypeFor: Record<string, Record<string, string>> = {
      unit: { kind: 'pure' },
      integration: { kind: 'intra-system' },
      e2e: { path_kind: 'happy', profile_kind: 'smoke' },
      regression: { kind: 'behavioral' },
      negative: { kind: 'input-validation' },
      adversarial: { kind: 'protocol-misuse' },
      governance: { kind: 'authz-policy' },
    }
    const authorFor: Record<string, 'infra' | 'qa'> = {
      unit: 'infra',
      integration: 'infra',
      e2e: 'infra',
      regression: 'infra',
      negative: 'infra',
      adversarial: 'qa',
      governance: 'qa',
    }

    const files: Record<string, string> = {}
    const tests: TestManifest['tests'] = []
    for (const cat of required) {
      for (const n of [1, 2]) {
        const path = `src/${cat}-${n}.test.ts`
        files[path] = REAL
        tests.push({ path, area: 'core', category: cat, subtypes: subtypeFor[cat], author: authorFor[cat], risk: 'low' })
      }
    }

    const report = audit(cfg, { tests }, memHost(files))

    expect(report).toMatchObject({ total: 14, onDisk: 14 })
    expect(report.findings).toEqual([])
    expect(isFatal(report)).toBe(false)
  })
})
