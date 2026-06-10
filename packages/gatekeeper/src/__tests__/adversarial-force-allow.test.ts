// adversarial / protocol-misuse — an attacker who controls the PromotionInput facts tries to force
// an illegitimate ALLOW: smuggling a humanApproved=true to override a real blocker, and skipping
// staging by promoting a feature branch straight to production. The gate's DENY-precedence must
// hold: no caller-supplied flag may override a hard blocker, and no spoofed approval buys an
// unauthorised edge. The decider trusts its facts, so this proves the POLICY closes these holes.
import { describe, it, expect } from 'vitest'
import { promotionVerdict, stagingFirstPolicy } from '../core'

const policy = stagingFirstPolicy()

describe('promotionVerdict — forced-ALLOW attempts', () => {
  it('a spoofed humanApproved=true cannot override a real blocker (red tests)', () => {
    const v = promotionVerdict(
      { from: 'staging', to: 'main', testsGreen: false, humanApproved: true },
      policy,
    )
    expect(v.decision).toBe('DENY')
    expect(v.reasons).toContain('tests are not green')
  })

  it('a spoofed approval cannot clear outstanding gate violations', () => {
    const v = promotionVerdict(
      { from: 'feat/x', to: 'staging', testsGreen: true, gateViolations: ['unsigned commit'], humanApproved: true },
      policy,
    )
    expect(v.decision).toBe('DENY')
    expect(v.reasons.some((r) => r.includes('gate violation'))).toBe(true)
  })

  it('skipping staging — feature straight to main — is denied even when fully approved and green', () => {
    const v = promotionVerdict(
      { from: 'feat/sneaky', to: 'main', testsGreen: true, humanApproved: true, risk: 'normal' },
      policy,
    )
    expect(v.decision).toBe('DENY')
    expect(v.reasons.some((r) => r.includes('not an allowed edge'))).toBe(true)
  })

  it('downgrading a critical change to normal still cannot skip the staging edge to main', () => {
    // Even if an attacker lies about risk to dodge REVIEW, the edge gate (a DENY-tier check) fires
    // first and blocks the unauthorised feature→main jump regardless of the risk claim.
    const v = promotionVerdict(
      { from: 'feat/x', to: 'main', testsGreen: true, risk: 'normal', humanApproved: true },
      policy,
    )
    expect(v.decision).toBe('DENY')
  })
})
