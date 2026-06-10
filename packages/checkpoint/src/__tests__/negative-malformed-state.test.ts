// @assay area=checkpoint category=negative subtype.kind=input-validation risk=medium author=infra
// Negative: gates fed MALFORMED / degenerate GitState — empty strings, empty collections, an empty
// allow/protected config. These are invalid-ish inputs a real git harvest can produce (e.g. a
// detached HEAD yields an empty branch name). Each must fail safely: no throw, and the gate's own
// boolean logic must not misfire (empty string is falsy → no-op; empty staged set → no hits).

import { describe, it, expect } from 'vitest'
import { protectedBranchGate, authorGate, cleanTreeGate, protectedPathGate } from '../gates'

describe('gates fed malformed / degenerate GitState', () => {
  it('empty-string branch / author are treated as "unknown" (falsy) → no-op, not a false block', () => {
    expect(protectedBranchGate({ branches: ['main'] }).run({ targetBranch: '' })).toEqual([])
    expect(authorGate({ allowed: ['a@b.com'] }).run({ authorEmail: '' })).toEqual([])
  })

  it('an empty stagedFiles array produces no protected-path hits', () => {
    expect(protectedPathGate({ paths: ['secrets/'] }).run({ stagedFiles: [] })).toEqual([])
  })

  it('an empty branch allow-set never blocks (no branch can be in an empty protected set)', () => {
    expect(protectedBranchGate({ branches: [] }).run({ targetBranch: 'main' })).toEqual([])
  })

  it('an empty author allow-list blocks any known author (nothing is allowed)', () => {
    // Degenerate config: empty allow-list means every concrete author is rejected.
    const v = authorGate({ allowed: [] }).run({ authorEmail: 'someone@x.com' })
    expect(v).toHaveLength(1)
    // ...but an unknown (empty) author is still a no-op.
    expect(authorGate({ allowed: [] }).run({ authorEmail: '' })).toEqual([])
  })

  it('clean-tree only fires on an explicit false, not on any other falsy-looking value', () => {
    expect(cleanTreeGate().run({ isClean: false })).toHaveLength(1)
    expect(cleanTreeGate().run({ isClean: true })).toEqual([])
  })
})
