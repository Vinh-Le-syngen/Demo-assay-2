// unit / pure — verdict-construction helpers of promotionVerdict, exercised with no policy and no
// I/O. Asserts the SHAPE and content of the returned PromotionVerdict (decision + reasons array):
// the ALLOW note wording, the human-approved note variant, and that every blocker reason is
// aggregated rather than short-circuited. Pure, deterministic, no host.
import { describe, it, expect } from 'vitest'
import { promotionVerdict, type PromotionVerdict } from '../core'

describe('promotionVerdict — pure verdict construction', () => {
  it('returns a well-formed verdict (decision + non-empty reasons) for a clear ALLOW', () => {
    const v: PromotionVerdict = promotionVerdict({ from: 'a', to: 'b', testsGreen: true })
    expect(v).toEqual({ decision: 'ALLOW', reasons: ['all checks pass'] })
    expect(Array.isArray(v.reasons)).toBe(true)
    expect(v.reasons.length).toBeGreaterThan(0)
  })

  it('uses the human-approved note variant when an approval is supplied', () => {
    const v = promotionVerdict({ from: 'a', to: 'b', testsGreen: true, humanApproved: true })
    expect(v.decision).toBe('ALLOW')
    expect(v.reasons).toContain('all checks pass (human-approved)')
  })

  it('aggregates every blocker reason rather than stopping at the first', () => {
    const v = promotionVerdict({
      from: 'a',
      to: 'b',
      testsGreen: false,
      gateViolations: ['x', 'y'],
    })
    expect(v.decision).toBe('DENY')
    // tests-not-green + the gate-violations summary = two distinct reasons.
    expect(v.reasons).toContain('tests are not green')
    expect(v.reasons.some((r) => r.includes('2 gate violation(s): x; y'))).toBe(true)
    expect(v.reasons.length).toBe(2)
  })

  it('summarises a single gate violation with its message inlined', () => {
    const v = promotionVerdict({ from: 'a', to: 'b', testsGreen: true, gateViolations: ['unsigned commit'] })
    expect(v.decision).toBe('DENY')
    expect(v.reasons).toEqual(['1 gate violation(s): unsigned commit'])
  })
})
