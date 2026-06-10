// UNIT (pure) — the pure decision helpers in isolation: canUse + buildCategories invariants
// exercised as referentially-transparent functions (no store, no IO, no clock). Two unit cases.
import { describe, it, expect } from 'vitest'
import {
  canUse,
  buildCategories,
  ALL_CONSENT_CATEGORIES,
  NON_ESSENTIAL_CATEGORIES,
  type ConsentContext,
  type ConsentDecision,
  type ConsentCategory,
} from '../index'

const POLICY = '2026-06'
const REG = '1'
const ctx = (decision: ConsentDecision | null): ConsentContext => ({
  decision,
  policyVersion: POLICY,
  registryVersion: REG,
})
const decide = (granted: ConsentCategory[]): ConsentDecision => ({
  policyVersion: POLICY,
  registryVersion: REG,
  categories: buildCategories(ALL_CONSENT_CATEGORIES, granted),
  decidedAt: '2026-06-06T00:00:00.000Z',
})

// UNIT 1 — canUse is a pure function of (category, decision-state); same inputs → same output,
// and a denied category is independent of which OTHER categories were granted.
describe('unit: canUse is pure and category-isolated', () => {
  it('is deterministic across repeated evaluation with identical context', () => {
    const c = ctx(decide(['analytics']))
    const first = canUse('analytics', c)
    for (let i = 0; i < 25; i++) expect(canUse('analytics', c)).toBe(first)
    expect(first).toBe(true)
  })

  it('a category decision does not bleed into other categories', () => {
    // Grant only analytics; every OTHER non-essential must independently resolve to false.
    const c = ctx(decide(['analytics']))
    for (const cat of NON_ESSENTIAL_CATEGORIES) {
      expect(canUse(cat, c)).toBe(cat === 'analytics')
    }
  })
})
