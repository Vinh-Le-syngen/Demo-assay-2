// governance / authz-policy — the promotion AUTHORISATION policy itself, asserted as policy (not
// just behaviour): the canonical staging-first policy's structure (only staging→production reaches
// prod; production always needs human approval), DENY's strict precedence over both REVIEW and a
// supplied human approval, and that the human-hold for production cannot be configured away by risk
// alone. These are the promotion-safety invariants @sys/gatekeeper exists to guarantee.
import { describe, it, expect } from 'vitest'
import { promotionVerdict, stagingFirstPolicy } from '../core'

describe('staging-first policy — structural authorisation invariants', () => {
  it('encodes exactly two edges: anything→staging and staging→production', () => {
    const p = stagingFirstPolicy()
    expect(p.edges).toEqual([
      { from: '*', to: 'staging' },
      { from: 'staging', to: 'main' },
    ])
  })

  it('always lists the production branch as requiring human approval', () => {
    expect(stagingFirstPolicy().humanApprovalFor).toEqual(['main'])
    expect(stagingFirstPolicy({ production: 'release' }).humanApprovalFor).toEqual(['release'])
  })

  it('holds risky and critical changes for a human by default', () => {
    expect(stagingFirstPolicy().reviewRisk).toEqual(['risky', 'critical'])
  })

  it('production is unreachable except from staging — no feature branch may jump it', () => {
    const p = stagingFirstPolicy()
    expect(promotionVerdict({ from: 'feat/x', to: 'main', testsGreen: true }, p).decision).toBe('DENY')
    expect(promotionVerdict({ from: 'hotfix/y', to: 'main', testsGreen: true }, p).decision).toBe('DENY')
  })
})

describe('precedence — DENY outranks REVIEW and human approval', () => {
  it('a hard blocker on a human-hold target yields DENY, not REVIEW', () => {
    const p = stagingFirstPolicy()
    const v = promotionVerdict({ from: 'staging', to: 'main', testsGreen: false }, p)
    expect(v.decision).toBe('DENY')
  })

  it('a supplied human approval never downgrades a DENY to ALLOW', () => {
    const p = stagingFirstPolicy()
    const v = promotionVerdict({ from: 'staging', to: 'main', testsGreen: true, gateViolations: ['g'], humanApproved: true }, p)
    expect(v.decision).toBe('DENY')
  })

  it('the production human-hold cannot be bypassed by claiming normal risk', () => {
    const p = stagingFirstPolicy()
    const v = promotionVerdict({ from: 'staging', to: 'main', testsGreen: true, risk: 'normal' }, p)
    expect(v.decision).toBe('REVIEW')
    expect(v.reasons.some((r) => r.includes("target 'main' requires human approval"))).toBe(true)
  })
})
