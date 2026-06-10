// @assay area=checkpoint category=governance subtype.kind=process risk=high author=qa reviewer=infra
// Governance: asserts the POLICY DECISIONS encoded by the gate wiring, not just mechanics. These are
// the deploy-safety invariants the @sys/checkpoint harness exists to guarantee:
//   1. The harness fails closed — ANY single gate violation blocks the whole checkpoint.
//   2. Gates are independent: a failing gate never suppresses another gate's findings (every
//      violation is surfaced in one pass, so an operator fixes everything at once).
//   3. Stable, named result rows — each gate's verdict is attributable by name for audit.
// Complements gates.test.ts (mechanics) with the process/authz-policy contract of the composed chain.

import { describe, it, expect } from 'vitest'
import { runCheckpoint, passed, type Gate } from '../core'
import { protectedBranchGate, authorGate, cleanTreeGate } from '../gates'

const policyChain: Gate[] = [
  protectedBranchGate({ branches: ['main', 'staging'] }),
  authorGate({ allowed: ['sinuhe.arroyo@gmail.com'] }),
  cleanTreeGate(),
]

describe('checkpoint policy: fail-closed and full-disclosure', () => {
  it('a single violation in any gate fails the entire checkpoint (fail-closed)', () => {
    // Only the author gate trips; the checkpoint as a whole must still be blocked.
    const report = runCheckpoint(policyChain, {
      targetBranch: 'feat/ok',
      authorEmail: 'rogue@x.com',
      isClean: true,
    })
    expect(passed(report)).toBe(false)
    expect(report.violationCount).toBe(1)
  })

  it('every gate is evaluated and reported even when an earlier gate already failed (no short-circuit)', () => {
    const order: string[] = []
    const spy: Gate = { name: 'spy', run: () => { order.push('spy'); return [] } }
    const report = runCheckpoint(
      [
        { name: 'first-fail', run: () => { order.push('first'); return ['boom'] } },
        spy,
        cleanTreeGate(),
      ],
      { isClean: false },
    )
    // The spy ran despite first-fail's violation, and clean-tree's independent finding surfaced too.
    expect(order).toEqual(['first', 'spy'])
    expect(report.violationCount).toBe(2)
    expect(report.results.map((r) => r.name)).toEqual(['first-fail', 'spy', 'clean-tree'])
  })

  it('result rows are attributable by gate name for audit (one row per configured gate, in order)', () => {
    const report = runCheckpoint(policyChain, {})
    expect(report.results.map((r) => r.name)).toEqual(['protected-branch', 'author', 'clean-tree'])
    expect(passed(report)).toBe(true)
  })
})
