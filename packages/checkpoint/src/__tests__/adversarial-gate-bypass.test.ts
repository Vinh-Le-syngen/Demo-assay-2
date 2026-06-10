// @assay area=checkpoint category=adversarial subtype.kind=protocol-misuse risk=high author=qa reviewer=infra
// Adversarial: attempts to slip a dangerous push past the protected-branch and protected-path gates
// by exploiting the harness contract — supplying the WRONG GitState field, path-casing tricks, and
// near-miss prefixes. A bypass here means a direct write to a protected branch, or a protected file
// changed without the controlled process. Confirms the gates only honour what they actually assert.

import { describe, it, expect } from 'vitest'
import { runCheckpoint, passed } from '../core'
import { protectedBranchGate, protectedPathGate } from '../gates'

describe('protected-branch cannot be bypassed by field confusion', () => {
  it('a target-mode gate still blocks main even if attacker also sets a benign current branch', () => {
    const gate = protectedBranchGate({ branches: ['main'] }) // against: 'target'
    // Decoy: a safe-looking `branch` does not launder a protected `targetBranch`.
    expect(gate.run({ branch: 'feat/safe', targetBranch: 'main' })).toHaveLength(1)
  })

  it('branch matching is exact — near-miss names do NOT inherit protection, and protected ones are not escapable', () => {
    const gate = protectedBranchGate({ branches: ['main'] })
    // 'main-2'/'mainline' are genuinely different branches → correctly allowed (no over-block).
    expect(gate.run({ targetBranch: 'main-2' })).toEqual([])
    expect(gate.run({ targetBranch: 'mainline' })).toEqual([])
    // ...and the exact protected name has no casing escape hatch (branch names are case-sensitive).
    expect(gate.run({ targetBranch: 'main' })).toHaveLength(1)
    expect(gate.run({ targetBranch: 'Main' })).toEqual([]) // a literally different ref, not a bypass
  })
})

describe('protected-path cannot be bypassed by path tricks', () => {
  const gate = protectedPathGate({ paths: ['supabase/migrations/', /\.env(\.|$)/] })

  it('blocks the protected prefix and refuses to be fooled by a near-prefix sibling', () => {
    // A real protected file is caught.
    expect(gate.run({ stagedFiles: ['supabase/migrations/099.sql'] })).toHaveLength(1)
    // 'supabase/migrations-backup/...' shares no true prefix boundary trick — startsWith is literal,
    // so this sibling dir is NOT protected and must not be falsely flagged...
    expect(gate.run({ stagedFiles: ['supabase/migrations-backup/x.sql'] })).toEqual([])
    // ...but an attacker cannot hide a protected file deeper in the tree under the same prefix.
    expect(gate.run({ stagedFiles: ['supabase/migrations/sub/dir/evil.sql'] })).toHaveLength(1)
  })

  it('the whole harness still fails closed when a bypass attempt trips any one gate', () => {
    const report = runCheckpoint([protectedBranchGate({ branches: ['main'] }), gate], {
      branch: 'feat/decoy',
      targetBranch: 'main',
      stagedFiles: ['app/.env.local'],
    })
    expect(passed(report)).toBe(false)
    expect(report.violationCount).toBe(2)
  })
})
