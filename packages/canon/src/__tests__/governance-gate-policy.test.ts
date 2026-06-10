// governance (kind: authz-policy) — @sys/canon. GATE_POLICY is the policy DATA that decides which gate
// verdicts BLOCK a deploy or a launch (and at what severity). @eng/governance reads this; if the policy
// data drifts, compliance-critical gates could stop blocking. These tests pin the governance contract:
// the honesty/safety gates (claim-scan, schema, claim-capability, page-authority, noindex) must block
// deploy at high-or-critical severity, while advisory gates (freshness, cannibalization) must not block
// deploy. Pure, no IO. Author qa, reviewer infra — this is compliance-critical policy.
import { describe, it, expect } from 'vitest'
import { GATE_POLICY, Severity } from '../core'

describe('governance/authz-policy — gate policy blocks the right verdicts at the right severity', () => {
  it('compliance-critical gates block BOTH deploy and launch', () => {
    for (const gate of ['claim-scan', 'schema', 'page-authority', 'noindex'] as const) {
      expect(GATE_POLICY[gate].blocksDeploy).toBe(true)
      expect(GATE_POLICY[gate].blocksLaunch).toBe(true)
    }
    // claim-scan and schema are the hardest: critical severity
    expect(GATE_POLICY['claim-scan'].defaultSeverity).toBe('critical')
    expect(GATE_POLICY['schema'].defaultSeverity).toBe('critical')
  })

  it('honesty-anchor gates block launch even if some only warn on deploy', () => {
    // claim-capability (a claim with no backing capability) must block deploy at >= high
    expect(GATE_POLICY['claim-capability'].blocksDeploy).toBe(true)
    expect(GATE_POLICY['claim-capability'].defaultSeverity).toBe('high')
    // service-authority / jurisdiction must at least block LAUNCH (cannot sell what we are not authorized for)
    expect(GATE_POLICY['service-authority'].blocksLaunch).toBe(true)
    expect(GATE_POLICY['jurisdiction'].blocksLaunch).toBe(true)
  })

  it('advisory gates never block deploy and never sit at critical', () => {
    for (const gate of ['freshness', 'cannibalization'] as const) {
      expect(GATE_POLICY[gate].blocksDeploy).toBe(false)
      expect(GATE_POLICY[gate].defaultSeverity).not.toBe('critical')
    }
    // freshness is purely advisory — it blocks neither deploy nor launch
    expect(GATE_POLICY['freshness'].blocksLaunch).toBe(false)
  })

  it('every gate policy is well-formed and no gate is silently a no-op (fail-closed inventory)', () => {
    const gates = Object.keys(GATE_POLICY) as (keyof typeof GATE_POLICY)[]
    expect(gates.length).toBeGreaterThanOrEqual(8)
    for (const g of gates) {
      const p = GATE_POLICY[g]
      expect(typeof p.blocksDeploy).toBe('boolean')
      expect(typeof p.blocksLaunch).toBe('boolean')
      // severity must be a valid tier, never undefined/empty
      expect(Severity.safeParse(p.defaultSeverity).success).toBe(true)
      // a gate that blocks NOTHING and is only 'medium' is allowed (advisory), but no gate may have an
      // invalid severity or a non-boolean block flag — that would be an ungoverned policy row.
    }
  })
})
