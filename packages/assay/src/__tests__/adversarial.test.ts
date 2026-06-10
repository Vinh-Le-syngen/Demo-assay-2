// Adversarial (protocol-misuse): manifests crafted to EVADE the gates. The assertion in each
// case is that the gate still fires — a hostile author cannot self-classify or shell their way
// past the quality floor. Author `qa` per the governance-sensitive author rule.

import { describe, it, expect } from 'vitest'
import { defineAssay, type TestManifest } from '../config'
import { audit, isFatal, findingsForGate, type AssayHost } from '../engine'
import { SHELL_SNEAKY } from './_shell-fixtures'

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

describe('gate-evasion: shells dressed up to look real', () => {
  it('still flags a tautological / statically-skipped test that pads itself to look authored', () => {
    // A test that registers with full classification and authorship, but whose body is a
    // tautology AND a statically-skipped block — i.e. it asserts nothing real while presenting
    // as a legitimate registered test. detectShells must flag both the static-skip (fatal) and
    // the tautology (warn); the entry cannot launder itself past noShells via metadata.
    const cfg = defineAssay({ testRoots: ['src'] })
    const host = memHost({
      'src/sneaky.test.ts': SHELL_SNEAKY,
    })
    const manifest: TestManifest = {
      tests: [{ path: 'src/sneaky.test.ts', category: 'unit', subtypes: { kind: 'pure' }, author: 'infra' }],
    }

    const shells = findingsForGate(audit(cfg, manifest, host), 'noShells')
    expect(shells.some((f) => f.code === 'shell-static-skip' && f.severity === 'fatal')).toBe(true)
    expect(shells.some((f) => f.code === 'tautology' && f.severity === 'warn')).toBe(true)
    expect(isFatal(audit(cfg, manifest, host))).toBe(true)
  })
})
