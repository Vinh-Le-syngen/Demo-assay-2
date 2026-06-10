// unit / boundary — the edge-pattern matcher (matchPattern/edgeAllowed) at its boundaries, reached
// through the public promotionVerdict + a hand-built PromotionPolicy. Covers the three pattern
// forms ('*' any, 'prefix/*' prefix, exact) and their boundary cases: a prefix that is a strict
// proper prefix vs. an exact hit, and that `to` is matched exactly (never wildcarded). Pure.
import { describe, it, expect } from 'vitest'
import { promotionVerdict, type PromotionPolicy } from '../core'

// A green, normal, unapproved promotion: the ONLY thing that can move it off ALLOW is the edge gate,
// so the verdict is a clean probe of edgeAllowed.
const probe = (from: string, to: string, policy: PromotionPolicy) =>
  promotionVerdict({ from, to, testsGreen: true }, policy)

describe('edge matching — pattern boundaries', () => {
  it("'*' source matches any branch name", () => {
    const p: PromotionPolicy = { edges: [{ from: '*', to: 'staging' }] }
    expect(probe('feat/anything', 'staging', p).decision).toBe('ALLOW')
    expect(probe('', 'staging', p).decision).toBe('ALLOW')
  })

  it("'prefix/*' matches names starting with the prefix, including the bare prefix string", () => {
    const p: PromotionPolicy = { edges: [{ from: 'feat/*', to: 'staging' }] }
    expect(probe('feat/login', 'staging', p).decision).toBe('ALLOW')
    // 'feat/*'.slice(0,-1) === 'feat/', so the bare prefix 'feat/' also matches.
    expect(probe('feat/', 'staging', p).decision).toBe('ALLOW')
  })

  it("'prefix/*' does NOT match a sibling that merely shares leading characters", () => {
    const p: PromotionPolicy = { edges: [{ from: 'feat/*', to: 'staging' }] }
    // 'feature/x' does not start with 'feat/' (the slash boundary differs).
    const v = probe('feature/x', 'staging', p)
    expect(v.decision).toBe('DENY')
    expect(v.reasons.some((r) => r.includes('not an allowed edge'))).toBe(true)
  })

  it('the target is matched exactly — never treated as a wildcard', () => {
    const p: PromotionPolicy = { edges: [{ from: '*', to: 'main' }] }
    expect(probe('x', 'main', p).decision).toBe('ALLOW')
    expect(probe('x', 'mainline', p).decision).toBe('DENY')
    expect(probe('x', 'staging', p).decision).toBe('DENY')
  })

  it('an empty edge list allows nothing, while an omitted edge list allows everything', () => {
    expect(probe('a', 'b', { edges: [] }).decision).toBe('DENY')
    expect(probe('a', 'b', {}).decision).toBe('ALLOW')
  })
})
