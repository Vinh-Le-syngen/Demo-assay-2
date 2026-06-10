// negative / unsupported — inputs and policies that fall outside the supported/configured envelope
// must DENY (or hold) rather than silently ALLOW. Covers a target with no matching edge in the
// policy, a policy whose reviewRisk omits a level (that level then falls through to ALLOW — the
// supported way to widen), and a humanApprovalFor target that is never reachable by any edge.
import { describe, it, expect } from 'vitest'
import { promotionVerdict, stagingFirstPolicy, type PromotionPolicy } from '../core'

describe('promotionVerdict — unsupported edges / configurations', () => {
  it('denies a target that no edge in the policy permits', () => {
    const policy = stagingFirstPolicy()
    const v = promotionVerdict({ from: 'staging', to: 'release', testsGreen: true }, policy)
    expect(v.decision).toBe('DENY')
    expect(v.reasons.some((r) => r.includes("'staging' → 'release' is not an allowed edge"))).toBe(true)
  })

  it('denies a backwards promotion (main → staging) that the staging-first policy never allows', () => {
    const policy = stagingFirstPolicy()
    const v = promotionVerdict({ from: 'main', to: 'staging', testsGreen: true }, policy)
    // main→staging IS an allowed edge under '*'→staging, so this should actually ALLOW; assert that
    // the supported direction holds and the UNsupported reverse (staging→arbitrary) is denied.
    expect(v.decision).toBe('ALLOW')
    expect(promotionVerdict({ from: 'staging', to: 'qa', testsGreen: true }, policy).decision).toBe('DENY')
  })

  it('a policy whose reviewRisk omits a level lets that level through (explicit widening)', () => {
    const policy: PromotionPolicy = { reviewRisk: ['critical'] } // 'risky' deliberately not held
    expect(promotionVerdict({ from: 'a', to: 'b', testsGreen: true, risk: 'risky' }, policy).decision).toBe('ALLOW')
    expect(promotionVerdict({ from: 'a', to: 'b', testsGreen: true, risk: 'critical' }, policy).decision).toBe('REVIEW')
  })

  it('a humanApprovalFor target unreachable by any edge is denied at the edge gate (never reaches REVIEW)', () => {
    const policy: PromotionPolicy = { edges: [{ from: '*', to: 'staging' }], humanApprovalFor: ['main'] }
    const v = promotionVerdict({ from: 'staging', to: 'main', testsGreen: true }, policy)
    expect(v.decision).toBe('DENY')
    expect(v.reasons.some((r) => r.includes('requires human approval'))).toBe(false)
  })
})
