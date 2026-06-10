// NEGATIVE (input-validation | unsupported) — malformed / unsupported inputs to the decision
// engine. The engine must fail SAFE (necessary-only) rather than throw or leak a grant. Two cases.
import { describe, it, expect } from 'vitest'
import {
  canUse,
  type ConsentContext,
  type ConsentCategory,
  type ConsentDecision,
  type CategoryChoice,
} from '../index'

const POLICY = '2026-06'
const REG = '1'

// NEGATIVE 1 (input-validation) — a stored decision whose categories map omits a category
// (corrupt / partially-written record) must not be read as a grant: the missing category
// resolves to false (anything !== 'granted' denies), never crashes.
describe('negative: a decision missing a category resolves to denied, not granted', () => {
  it('absent key in the categories map → canUse is false (no throw)', () => {
    const partial: Partial<Record<ConsentCategory, CategoryChoice>> = {
      strictly_necessary: 'granted',
      analytics: 'granted',
      // preferences / marketing / support intentionally absent
    }
    const decision: ConsentDecision = {
      policyVersion: POLICY,
      registryVersion: REG,
      // Deliberately-incomplete map cast through the contract type (corrupt-record simulation).
      categories: partial as ConsentDecision['categories'],
      decidedAt: '2026-06-06T00:00:00.000Z',
    }
    const ctx: ConsentContext = { decision, policyVersion: POLICY, registryVersion: REG }
    expect(() => canUse('marketing', ctx)).not.toThrow()
    expect(canUse('marketing', ctx)).toBe(false) // missing → denied
    expect(canUse('analytics', ctx)).toBe(true) // present grant still honored
    expect(canUse('strictly_necessary', ctx)).toBe(true) // essential always on
  })
})
