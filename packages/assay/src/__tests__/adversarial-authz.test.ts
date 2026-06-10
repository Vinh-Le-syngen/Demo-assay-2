// Adversarial (protocol-misuse): manifests crafted to EVADE the authorSeparation policy — a
// hostile author cannot self-classify or self-review past the authorship floor. Split from
// adversarial.test.ts to keep the adversarial category at two files; same in-memory host double.
// Author `qa` per the governance-sensitive author rule.

import { describe, it, expect } from 'vitest'
import { defineAssay, type TestManifest } from '../config'
import { audit, isFatal, findingsForGate, type AssayHost } from '../engine'

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

describe('protocol-misuse: classifying around the authorSeparation policy', () => {
  it('blocks a self-reviewed governance test trying to satisfy independence with its own author', () => {
    // Attempt to evade reviewer-independence: a high-risk governance test names the SAME role
    // as both author and reviewer to "check the box". authorSeparation must reject it.
    const cfg = defineAssay({ testRoots: ['src'] })
    const host = memHost({ 'src/policy.test.ts': 'it("x", () => { expect(a).toBe(b) })' })
    const manifest: TestManifest = {
      tests: [
        {
          path: 'src/policy.test.ts',
          category: 'governance',
          subtypes: { kind: 'authz-policy' },
          risk: 'high',
          author: 'qa',
          reviewer: 'qa', // not independent
        },
      ],
    }

    const auth = findingsForGate(audit(cfg, manifest, host), 'authorSeparation')
    expect(auth.some((f) => f.code === 'reviewer-not-independent' && f.severity === 'fatal')).toBe(true)
    expect(isFatal(audit(cfg, manifest, host))).toBe(true)
  })

  it('blocks an adversarial test mis-authored by a non-permitted role to dodge the qa-only rule', () => {
    // adversarial is governance-sensitive and qa-only. An entry that self-classifies as
    // adversarial but lists author `infra` (to route around qa scrutiny) must be rejected for
    // author-role membership — the manifest cannot grant itself authoring rights it lacks.
    const cfg = defineAssay({ testRoots: ['src'] })
    const host = memHost({ 'src/evil.test.ts': 'it("x", () => { expect(payload).toBe(rejected) })' })
    const manifest: TestManifest = {
      tests: [{ path: 'src/evil.test.ts', category: 'adversarial', subtypes: { kind: 'prompt-injection' }, author: 'infra' }],
    }

    const auth = findingsForGate(audit(cfg, manifest, host), 'authorSeparation')
    expect(auth.some((f) => f.code === 'author-role-not-allowed' && f.severity === 'fatal')).toBe(true)
    expect(isFatal(audit(cfg, manifest, host))).toBe(true)
  })
})
