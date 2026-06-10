// negative / input-validation — malformed and minimal PromotionInput. The decider has no schema
// layer (it trusts the caller's TypeScript types), so the resilience contract is: degenerate-but-
// type-valid inputs must still produce a deterministic, defensible verdict rather than throwing.
// Covers empty branch names, an empty gateViolations array (must NOT count as a blocker), and a
// missing/undefined risk defaulting to 'normal'.
import { describe, it, expect } from 'vitest'
import { promotionVerdict, stagingFirstPolicy } from '../core'

const policy = stagingFirstPolicy()

describe('promotionVerdict — malformed / minimal input', () => {
  it('treats empty-string branch names as a disallowed edge, not a crash', () => {
    const v = promotionVerdict({ from: '', to: '', testsGreen: true }, policy)
    expect(v.decision).toBe('DENY')
    expect(v.reasons.some((r) => r.includes('not an allowed edge'))).toBe(true)
  })

  it('an empty gateViolations array is not a blocker', () => {
    const v = promotionVerdict({ from: 'feat/x', to: 'staging', testsGreen: true, gateViolations: [] }, policy)
    expect(v.decision).toBe('ALLOW')
    expect(v.reasons.some((r) => r.includes('gate violation'))).toBe(false)
  })

  it('an omitted risk defaults to normal (no spurious REVIEW)', () => {
    const v = promotionVerdict({ from: 'feat/x', to: 'staging', testsGreen: true }, policy)
    expect(v.decision).toBe('ALLOW')
  })

  it('an omitted gateViolations field behaves identically to an empty list', () => {
    const a = promotionVerdict({ from: 'feat/x', to: 'staging', testsGreen: true }, policy)
    const b = promotionVerdict({ from: 'feat/x', to: 'staging', testsGreen: true, gateViolations: [] }, policy)
    expect(a).toEqual(b)
  })

  it('does not throw on a whitespace-only branch name (still just a disallowed edge)', () => {
    expect(() => promotionVerdict({ from: '   ', to: 'main', testsGreen: true }, policy)).not.toThrow()
    expect(promotionVerdict({ from: '   ', to: 'main', testsGreen: true }, policy).decision).toBe('DENY')
  })
})
