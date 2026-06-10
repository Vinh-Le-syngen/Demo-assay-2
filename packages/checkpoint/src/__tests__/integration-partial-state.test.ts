// @assay area=checkpoint category=integration subtype.kind=intra-system risk=high author=infra
// Integration: runCheckpoint composing gates that read DIFFERENT GitState fields, fed a partial
// state. Verifies the harness lets each gate consume only what it needs (a pre-commit context has
// no targetBranch; a pre-push context has no stagedFiles) and still aggregates correctly. This is
// the cross-gate contract the harness promises — gates are independent and field-scoped.

import { describe, it, expect } from 'vitest'
import { runCheckpoint, passed } from '../core'
import { protectedBranchGate, authorGate, cleanTreeGate, protectedPathGate } from '../gates'

const guard = [
  protectedBranchGate({ branches: ['main'], against: 'current' }),
  authorGate({ allowed: ['ci@qarar.dev'] }),
  cleanTreeGate(),
  protectedPathGate({ paths: [/\.env/] }),
]

describe('runCheckpoint — partial GitState across heterogeneous gates', () => {
  it('a pre-commit state (branch+author, no tree/staged info) only trips the gates whose fields are present', () => {
    // Only `branch` and `authorEmail` supplied: clean-tree and protected-path are no-ops by design.
    const report = runCheckpoint(guard, { branch: 'main', authorEmail: 'ci@qarar.dev' })
    expect(report.violationCount).toBe(1) // protected-branch only
    expect(report.results.find((r) => r.name === 'protected-branch')?.violations).toHaveLength(1)
    expect(report.results.find((r) => r.name === 'clean-tree')?.violations).toEqual([])
    expect(report.results.find((r) => r.name === 'protected-path')?.violations).toEqual([])
  })

  it('an empty GitState is a no-op for every composed gate (passes)', () => {
    const report = runCheckpoint(guard, {})
    expect(passed(report)).toBe(true)
    expect(report.results).toHaveLength(4)
    expect(report.results.every((r) => r.violations.length === 0)).toBe(true)
  })

  it('a staged .env file trips protected-path while branch/author/tree stay clean', () => {
    const report = runCheckpoint(guard, {
      branch: 'feat/x',
      authorEmail: 'ci@qarar.dev',
      isClean: true,
      stagedFiles: ['config/.env.production'],
    })
    expect(report.violationCount).toBe(1)
    expect(report.results.find((r) => r.name === 'protected-path')?.violations).toHaveLength(1)
  })
})
