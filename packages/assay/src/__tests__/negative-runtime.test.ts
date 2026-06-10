// Negative (input-validation): malformed/stale manifest entries fed to the gates at RUNTIME must
// be flagged rather than crash the audit. Split from negative.test.ts to keep the negative
// category at two files; same in-memory host double. Covers missing-file (stale, no false shell)
// and invalid/unknown subtype classification handling. Author `infra`.

import { describe, it, expect } from 'vitest'
import { defineAssay, type TestManifest } from '../config'
import { audit, findingsForGate, type AssayHost } from '../engine'

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

describe('gate behavior on missing / malformed runtime input', () => {
  it('treats a registered-but-missing file as stale (not a shell crash)', () => {
    // readFile returns null for the missing path; detectShells must skip it, leaving only the
    // stale finding — no false shell-no-expect and no exception.
    const cfg = defineAssay({ testRoots: ['src'] })
    const host = memHost({ 'src/a.test.ts': 'it("x", () => { expect(a).toBe(b) })' })
    const manifest: TestManifest = { tests: [{ path: 'src/a.test.ts' }, { path: 'src/missing.test.ts' }] }

    const report = audit(cfg, manifest, host)
    expect(findingsForGate(report, 'noStale').map((f) => f.path)).toEqual(['src/missing.test.ts'])
    expect(findingsForGate(report, 'noShells').some((f) => f.path === 'src/missing.test.ts')).toBe(false)
  })

  it('flags an invalid subtype value and unknown subtype axis as fatal classification errors', () => {
    const cfg = defineAssay({ testRoots: ['src'] })
    const host = memHost({
      'src/bad-sub.test.ts': 'it("x", () => { expect(a).toBe(b) })',
      'src/bad-axis.test.ts': 'it("x", () => { expect(a).toBe(b) })',
    })
    const manifest: TestManifest = {
      tests: [
        { path: 'src/bad-sub.test.ts', category: 'unit', subtypes: { kind: 'nonsense' } },
        { path: 'src/bad-axis.test.ts', category: 'unit', subtypes: { flavor: 'pure' } },
      ],
    }

    const cls = findingsForGate(audit(cfg, manifest, host), 'validClassification')
    expect(cls.some((f) => f.code === 'invalid-subtype' && f.path === 'src/bad-sub.test.ts')).toBe(true)
    expect(cls.some((f) => f.code === 'unknown-subtype-axis' && f.path === 'src/bad-axis.test.ts')).toBe(true)
    expect(cls.every((f) => f.severity === 'fatal')).toBe(true)
  })
})
