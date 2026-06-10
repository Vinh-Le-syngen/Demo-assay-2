// GOVERNANCE (process | risk-mapping) — the consent POLICY contract the host must not be able to
// violate through the engine: the safe-default invariant (no/stale decision ⇒ necessary-only),
// the "essential is never deniable" invariant, and the vocabulary's governance shape. These encode
// the privacy commitments stated in core.ts's header, not mere behavior. Authored by qa.
import { describe, it, expect } from 'vitest'
import {
  canUse,
  buildCategories,
  requiresReprompt,
  CONSENT_CATEGORIES,
  ALL_CONSENT_CATEGORIES,
  NON_ESSENTIAL_CATEGORIES,
  type ConsentContext,
  type ConsentDecision,
} from '../index'

const POLICY = '2026-06'
const REG = '1'

// GOVERNANCE 1 (process) — the SAFE-DEFAULT policy: in EVERY pre-decision or stale state, no
// non-essential category may run. This is the privacy-by-default commitment; if it ever regressed
// to "allow on uncertainty" the package would silently leak tracking. Enumerate the uncertain
// states and assert necessary-only across the whole non-essential vocabulary.
describe('governance: safe-default — uncertainty never grants a non-essential category', () => {
  const grantAll: ConsentDecision = {
    policyVersion: POLICY,
    registryVersion: REG,
    categories: buildCategories(ALL_CONSENT_CATEGORIES, [...NON_ESSENTIAL_CATEGORIES]),
    decidedAt: '2026-06-06T00:00:00.000Z',
  }
  const uncertain: ConsentContext[] = [
    // no decision yet
    { decision: null, policyVersion: POLICY, registryVersion: REG },
    // policy drifted (grants were for an older policy)
    { decision: { ...grantAll, policyVersion: 'OLD' }, policyVersion: POLICY, registryVersion: REG },
    // registry drifted (vendor set changed since the decision)
    { decision: { ...grantAll, registryVersion: '0' }, policyVersion: POLICY, registryVersion: REG },
  ]

  it('each uncertain state requires a reprompt', () => {
    for (const ctx of uncertain) expect(requiresReprompt(ctx)).toBe(true)
  })

  it('each uncertain state grants strictly_necessary and denies every non-essential category', () => {
    for (const ctx of uncertain) {
      expect(canUse('strictly_necessary', ctx)).toBe(true)
      for (const cat of NON_ESSENTIAL_CATEGORIES) expect(canUse(cat, ctx)).toBe(false)
    }
  })
})

// GOVERNANCE 2 (risk-mapping) — the vocabulary's governance shape: exactly one essential category
// (strictly_necessary) carries the always-on risk exemption, every other category is opt-in, and
// buildCategories can never produce a denied strictly_necessary. A second essential category, or a
// deniable essential, would be a policy breach — these assertions lock the risk mapping.
describe('governance: vocabulary risk mapping is exactly one always-on essential', () => {
  it('strictly_necessary is the sole essential and the sole non-toggleable category', () => {
    const essentials = CONSENT_CATEGORIES.filter((c) => c.essential).map((c) => c.id)
    expect(essentials).toEqual(['strictly_necessary'])
    expect(NON_ESSENTIAL_CATEGORIES).not.toContain('strictly_necessary')
  })

  it('buildCategories cannot deny the essential category under any grant set', () => {
    for (const grant of [[], ['analytics'], [...NON_ESSENTIAL_CATEGORIES]] as const) {
      const map = buildCategories(ALL_CONSENT_CATEGORIES, [...grant])
      expect(map.strictly_necessary).toBe('granted')
    }
  })
})
