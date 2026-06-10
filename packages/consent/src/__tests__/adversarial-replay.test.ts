// ADVERSARIAL (protocol-misuse) — replay attack: a caller presents a stale-but-grant-laden
// decision hoping the engine honors the embedded grants. Stale policy/registry → reprompt and
// necessary-only fallback. Split sibling of adversarial-protocol.test.ts (same imports/setup).
import { describe, it, expect } from 'vitest'
import {
  canUse,
  canLoadVendor,
  buildCategories,
  ALL_CONSENT_CATEGORIES,
  type ConsentContext,
  type ConsentDecision,
} from '../index'

const CURRENT_POLICY = '2026-06'
const CURRENT_REG = '2'

// ADVERSARIAL 1 (protocol-misuse) — replay attack: an attacker presents an OLD decision that
// granted everything, hoping the engine honors the embedded grants. Because the stored
// policy/registry no longer match the current versions, the engine MUST reprompt and fall back
// to necessary-only — the replayed grants are ignored, vendors stay blocked.
describe('adversarial: replaying a stale all-granted decision is rejected', () => {
  it('grant-all decision from an old policy/registry yields zero non-essential access', () => {
    const staleGrantAll: ConsentDecision = {
      policyVersion: '2025-01', // old
      registryVersion: '1', // old
      categories: buildCategories(ALL_CONSENT_CATEGORIES, [
        'preferences',
        'analytics',
        'marketing',
        'support',
      ]),
      decidedAt: '2025-01-01T00:00:00.000Z',
    }
    const ctx: ConsentContext = {
      decision: staleGrantAll,
      policyVersion: CURRENT_POLICY,
      registryVersion: CURRENT_REG,
    }
    for (const cat of ['preferences', 'analytics', 'marketing', 'support'] as const) {
      expect(canUse(cat, ctx)).toBe(false)
      expect(canLoadVendor({ category: cat, required: false }, ctx)).toBe(false)
    }
    // Only the always-on essential survives.
    expect(canUse('strictly_necessary', ctx)).toBe(true)
  })
})
