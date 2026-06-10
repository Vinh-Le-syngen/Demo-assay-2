import { describe, it, expect } from 'vitest'
import { promotionVerdict, stagingFirstPolicy } from '../core'

const policy = stagingFirstPolicy() // *→staging; staging→main; main needs human; risky/critical hold

describe('promotionVerdict — hard blockers (DENY)', () => {
  it('denies when tests are not green', () => {
    const v = promotionVerdict({ from: 'feat/x', to: 'staging', testsGreen: false }, policy)
    expect(v.decision).toBe('DENY')
    expect(v.reasons).toContain('tests are not green')
  })

  it('denies on outstanding gate violations', () => {
    const v = promotionVerdict(
      { from: 'feat/x', to: 'staging', testsGreen: true, gateViolations: ['bad author'] },
      policy,
    )
    expect(v.decision).toBe('DENY')
    expect(v.reasons[0]).toContain('1 gate violation')
  })

  it('denies a disallowed edge (feature straight to main)', () => {
    const v = promotionVerdict({ from: 'feat/x', to: 'main', testsGreen: true }, policy)
    expect(v.decision).toBe('DENY')
    expect(v.reasons.some((r) => r.includes('not an allowed edge'))).toBe(true)
  })

  it('reports all blockers at once', () => {
    const v = promotionVerdict(
      { from: 'feat/x', to: 'main', testsGreen: false, gateViolations: ['v'] },
      policy,
    )
    expect(v.decision).toBe('DENY')
    expect(v.reasons.length).toBe(3)
  })
})

describe('promotionVerdict — human hold (REVIEW)', () => {
  it('holds staging → main for a human even when green', () => {
    const v = promotionVerdict({ from: 'staging', to: 'main', testsGreen: true }, policy)
    expect(v.decision).toBe('REVIEW')
    expect(v.reasons.some((r) => r.includes('requires human approval'))).toBe(true)
  })

  it('holds a risky/critical change for a human', () => {
    const v = promotionVerdict({ from: 'feat/x', to: 'staging', testsGreen: true, risk: 'critical' }, policy)
    expect(v.decision).toBe('REVIEW')
    expect(v.reasons.some((r) => r.includes("risk 'critical'"))).toBe(true)
  })

  it('a human approval clears the hold → ALLOW', () => {
    const v = promotionVerdict(
      { from: 'staging', to: 'main', testsGreen: true, humanApproved: true },
      policy,
    )
    expect(v.decision).toBe('ALLOW')
  })
})

describe('promotionVerdict — clear path (ALLOW)', () => {
  it('allows a green feature → staging promotion', () => {
    const v = promotionVerdict({ from: 'feat/x', to: 'staging', testsGreen: true }, policy)
    expect(v.decision).toBe('ALLOW')
  })

  it('a blocker still beats an approval (DENY precedence over humanApproved)', () => {
    const v = promotionVerdict(
      { from: 'staging', to: 'main', testsGreen: false, humanApproved: true },
      policy,
    )
    expect(v.decision).toBe('DENY')
  })
})

describe('stagingFirstPolicy', () => {
  it('is configurable for custom branch names', () => {
    const p = stagingFirstPolicy({ production: 'production', staging: 'release' })
    expect(promotionVerdict({ from: 'release', to: 'production', testsGreen: true }, p).decision).toBe('REVIEW')
    expect(promotionVerdict({ from: 'feat/y', to: 'release', testsGreen: true }, p).decision).toBe('ALLOW')
  })

  it('with no policy (any edge), only tests/gates/risk gate the verdict', () => {
    expect(promotionVerdict({ from: 'a', to: 'b', testsGreen: true }).decision).toBe('ALLOW')
    expect(promotionVerdict({ from: 'a', to: 'b', testsGreen: false }).decision).toBe('DENY')
  })
})
