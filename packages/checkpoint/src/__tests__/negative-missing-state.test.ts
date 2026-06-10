// @assay area=checkpoint category=negative subtype.kind=input-validation risk=medium author=infra
// Negative: gates fed MISSING / undefined GitState fields. The harness is designed to run with a
// partial snapshot (a pre-commit gate has no targetBranch), so absence MUST be a safe no-op, never
// a thrown error and never a spurious violation. Asserts the error path is "fail safe / pass".

import { describe, it, expect } from 'vitest'
import { runCheckpoint } from '../core'
import { protectedBranchGate, authorGate, cleanTreeGate, protectedPathGate } from '../gates'

describe('gates with missing GitState fields are no-ops, never throw', () => {
  it('protected-branch is a no-op when the relevant branch field is absent', () => {
    const target = protectedBranchGate({ branches: ['main'] })
    const current = protectedBranchGate({ branches: ['main'], against: 'current' })
    // against=target but only `branch` provided → undefined targetBranch → no violation.
    expect(target.run({ branch: 'main' })).toEqual([])
    // against=current but only `targetBranch` provided → undefined branch → no violation.
    expect(current.run({ targetBranch: 'main' })).toEqual([])
  })

  it('author / clean-tree are no-ops on undefined author / isClean', () => {
    expect(authorGate({ allowed: ['a@b.com'] }).run({})).toEqual([])
    // isClean undefined (only `=== false` is a violation) → no-op.
    expect(cleanTreeGate().run({ branch: 'x' })).toEqual([])
  })

  it('protected-path tolerates an absent stagedFiles array', () => {
    expect(protectedPathGate({ paths: ['secrets/'] }).run({})).toEqual([])
  })

  it('runCheckpoint over a wholly empty state throws nothing and passes', () => {
    const report = runCheckpoint(
      [protectedBranchGate({ branches: ['main'] }), authorGate({ allowed: ['a@b.com'] }), cleanTreeGate()],
      {},
    )
    expect(report.violationCount).toBe(0)
  })
})
