// adversarial / protocol-misuse — attempts to abuse the edge-pattern grammar and the human-hold to
// reach production illegitimately: crafting a `from` that tries to satisfy a 'prefix/*' rule it must
// not, riding the '*'→staging wildcard to a non-staging target, and confirming that the only route
// to main (staging→main) still cannot be auto-approved without an explicit humanApproved flag.
import { describe, it, expect } from 'vitest'
import { promotionVerdict, stagingFirstPolicy, type PromotionPolicy } from '../core'

describe('promotionVerdict — edge-grammar abuse', () => {
  it("the '*'→staging wildcard does not leak to a non-staging target", () => {
    const policy = stagingFirstPolicy()
    // 'main' is reachable only from 'staging'; a wildcard source aimed at 'main' must still match
    // the staging→main edge, which a feature branch does not.
    const v = promotionVerdict({ from: 'feat/x', to: 'main', testsGreen: true }, policy)
    expect(v.decision).toBe('DENY')
  })

  it("a crafted 'from' cannot satisfy a prefix rule whose boundary it does not respect", () => {
    const policy: PromotionPolicy = { edges: [{ from: 'release/*', to: 'main' }] }
    // 'release-hotfix' shares a prefix but lacks the '/' boundary — must be denied.
    expect(promotionVerdict({ from: 'release-hotfix', to: 'main', testsGreen: true }, policy).decision).toBe('DENY')
    // The legitimate, boundary-respecting form clears the edge gate (control assertion). This
    // bare policy sets no humanApprovalFor, so a green normal promotion ALLOWs once the edge matches.
    expect(promotionVerdict({ from: 'release/1.2', to: 'main', testsGreen: true }, policy).decision).toBe('ALLOW')
  })

  it('the only sanctioned route to main still demands an explicit human approval', () => {
    const policy = stagingFirstPolicy()
    const without = promotionVerdict({ from: 'staging', to: 'main', testsGreen: true }, policy)
    expect(without.decision).toBe('REVIEW')
    const withApproval = promotionVerdict({ from: 'staging', to: 'main', testsGreen: true, humanApproved: true }, policy)
    expect(withApproval.decision).toBe('ALLOW')
  })

  it('a custom policy cannot be tricked into ff-ing main by aliasing the production branch name', () => {
    // Attacker supplies a policy aimed at 'main' but tries to drive it from an unrelated source.
    const policy = stagingFirstPolicy({ production: 'main', staging: 'staging' })
    const v = promotionVerdict({ from: 'hotfix/now', to: 'main', testsGreen: true, humanApproved: true }, policy)
    expect(v.decision).toBe('DENY')
    expect(v.reasons.some((r) => r.includes('not an allowed edge'))).toBe(true)
  })
})
