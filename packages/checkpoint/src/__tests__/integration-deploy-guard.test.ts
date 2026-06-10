// @assay area=checkpoint category=integration subtype.kind=intra-system risk=high author=infra
// Integration: runCheckpoint composing the full deploy-safety gate chain over an injected GitState.
// Exercises the harness wiring the way a project assembles it (protected-branch + author +
// clean-tree + protected-path), not the gates in isolation. Real exported APIs only; GitState is
// the fake the harness is designed to consume.

import { describe, it, expect } from 'vitest'
import { runCheckpoint, passed } from '../core'
import {
  protectedBranchGate,
  authorGate,
  cleanTreeGate,
  protectedPathGate,
} from '../gates'

// The composed policy a Qarar-style deploy guard would assemble.
const deployGuard = [
  protectedBranchGate({ branches: ['main', 'staging'] }),
  authorGate({ allowed: ['sinuhe.arroyo@gmail.com'] }),
  cleanTreeGate(),
  protectedPathGate({ paths: ['supabase/migrations/'] }),
]

describe('runCheckpoint — composed deploy-safety chain', () => {
  it('passes a compliant push and preserves gate order in the result rows', () => {
    const report = runCheckpoint(deployGuard, {
      targetBranch: 'feat/widget',
      authorEmail: 'sinuhe.arroyo@gmail.com',
      isClean: true,
      stagedFiles: ['apps/web/src/page.tsx'],
    })
    expect(passed(report)).toBe(true)
    expect(report.violationCount).toBe(0)
    expect(report.results.map((r) => r.name)).toEqual([
      'protected-branch',
      'author',
      'clean-tree',
      'protected-path',
    ])
  })

  it('aggregates one violation per tripped gate in a single run (all-at-once reporting)', () => {
    const report = runCheckpoint(deployGuard, {
      targetBranch: 'main',
      authorEmail: 'intruder@evil.test',
      isClean: false,
      stagedFiles: ['supabase/migrations/099_drop.sql', 'src/ok.ts'],
    })
    expect(passed(report)).toBe(false)
    expect(report.violationCount).toBe(4)
    const byName = Object.fromEntries(report.results.map((r) => [r.name, r.violations.length]))
    expect(byName).toEqual({
      'protected-branch': 1,
      author: 1,
      'clean-tree': 1,
      'protected-path': 1,
    })
  })
})
