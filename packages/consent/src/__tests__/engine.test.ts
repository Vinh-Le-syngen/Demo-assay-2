import { describe, it, expect } from 'vitest'
import {
  canUse,
  canLoadVendor,
  requiresReprompt,
  buildCategories,
  CONSENT_CATEGORIES,
  ALL_CONSENT_CATEGORIES,
  NON_ESSENTIAL_CATEGORIES,
  type ConsentContext,
  type ConsentDecision,
  type ConsentCategory,
} from '../index'

const POLICY = '2026-06'
const REG = '1'
const ctx = (decision: ConsentDecision | null): ConsentContext => ({ decision, policyVersion: POLICY, registryVersion: REG })
const decide = (granted: ConsentCategory[], o?: { policy?: string; reg?: string }): ConsentDecision => ({
  policyVersion: o?.policy ?? POLICY,
  registryVersion: o?.reg ?? REG,
  categories: buildCategories(ALL_CONSENT_CATEGORIES, granted),
  decidedAt: '2026-06-06T00:00:00.000Z',
})

const OPTIONAL: ConsentCategory[] = ['preferences', 'analytics', 'marketing', 'support']

describe('vocabulary', () => {
  it('exactly one essential category (strictly_necessary)', () => {
    expect(CONSENT_CATEGORIES.filter((c) => c.essential).map((c) => c.id)).toEqual(['strictly_necessary'])
  })
  it('NON_ESSENTIAL = ALL minus strictly_necessary; ids unique', () => {
    expect([...NON_ESSENTIAL_CATEGORIES].sort()).toEqual([...OPTIONAL].sort())
    expect(new Set(ALL_CONSENT_CATEGORIES).size).toBe(ALL_CONSENT_CATEGORIES.length)
  })
})

describe('requiresReprompt — every version permutation', () => {
  it('no decision → true', () => expect(requiresReprompt(ctx(null))).toBe(true))
  it('matching versions → false', () => expect(requiresReprompt(ctx(decide([])))).toBe(false))
  it('policy drift → true', () => expect(requiresReprompt(ctx(decide([], { policy: 'x' })))).toBe(true))
  it('registry drift → true', () => expect(requiresReprompt(ctx(decide([], { reg: '9' })))).toBe(true))
  it('both drift → true', () => expect(requiresReprompt(ctx(decide([], { policy: 'x', reg: '9' })))).toBe(true))
})

describe('canUse — full matrix (category × state)', () => {
  it('strictly_necessary is true in every state', () => {
    for (const d of [null, decide([]), decide(OPTIONAL), decide([], { policy: 'old' })]) {
      expect(canUse('strictly_necessary', ctx(d))).toBe(true)
    }
  })
  it('no decision → every optional denied', () => {
    for (const c of OPTIONAL) expect(canUse(c, ctx(null))).toBe(false)
  })
  it('grant-all → every optional allowed', () => {
    const c = ctx(decide(OPTIONAL))
    for (const cat of OPTIONAL) expect(canUse(cat, c)).toBe(true)
  })
  it('partial grant → only chosen allowed', () => {
    const c = ctx(decide(['analytics', 'preferences']))
    expect(canUse('analytics', c)).toBe(true)
    expect(canUse('preferences', c)).toBe(true)
    expect(canUse('marketing', c)).toBe(false)
    expect(canUse('support', c)).toBe(false)
  })
  it('stale decision ignores stored grants → necessary-only', () => {
    for (const drift of [{ policy: 'old' }, { reg: '0' }]) {
      const c = ctx(decide(OPTIONAL, drift))
      for (const cat of OPTIONAL) expect(canUse(cat, c)).toBe(false)
      expect(canUse('strictly_necessary', c)).toBe(true)
    }
  })
})

describe('canLoadVendor — required / optional / country', () => {
  const granted = ctx(decide(['analytics']))
  it('required loads in any state, even with no decision or stale', () => {
    expect(canLoadVendor({ category: 'analytics', required: true }, ctx(null))).toBe(true)
    expect(canLoadVendor({ category: 'marketing', required: true }, ctx(decide([], { policy: 'old' })))).toBe(true)
  })
  it('optional follows its category', () => {
    expect(canLoadVendor({ category: 'analytics', required: false }, granted)).toBe(true)
    expect(canLoadVendor({ category: 'marketing', required: false }, granted)).toBe(false)
    expect(canLoadVendor({ category: 'analytics', required: false }, ctx(null))).toBe(false)
  })
  it('country gate: denied outside the list even when consented; allowed inside; ignored when unset', () => {
    const v = { category: 'analytics' as const, required: false, countries: ['AE', 'SG'] }
    expect(canLoadVendor(v, granted, 'VN')).toBe(false)
    expect(canLoadVendor(v, granted, 'AE')).toBe(true)
    expect(canLoadVendor(v, granted, undefined)).toBe(true) // no country arg → not gated
    expect(canLoadVendor({ category: 'analytics', required: false }, granted, 'VN')).toBe(true) // no countries list
  })
  it('country gate beats consent but NOT required', () => {
    const v = { category: 'analytics' as const, required: true, countries: ['AE'] }
    expect(canLoadVendor(v, ctx(null), 'VN')).toBe(false) // country still excludes a required vendor
  })
})

describe('buildCategories — invariants', () => {
  it('strictly_necessary always granted; essential cannot be denied', () => {
    expect(buildCategories(ALL_CONSENT_CATEGORIES, []).strictly_necessary).toBe('granted')
  })
  it('grants exactly the requested optional set', () => {
    const m = buildCategories(ALL_CONSENT_CATEGORIES, ['analytics'])
    expect(m.analytics).toBe('granted')
    expect(m.marketing).toBe('denied')
  })
  it('all-optional grant + empty grant', () => {
    expect(Object.values(buildCategories(ALL_CONSENT_CATEGORIES, OPTIONAL)).every((v) => v === 'granted')).toBe(true)
    const none = buildCategories(ALL_CONSENT_CATEGORIES, [])
    expect(Object.entries(none).filter(([, v]) => v === 'granted').map(([k]) => k)).toEqual(['strictly_necessary'])
  })
  it('idempotent', () => {
    expect(buildCategories(ALL_CONSENT_CATEGORIES, ['analytics'])).toEqual(buildCategories(ALL_CONSENT_CATEGORIES, ['analytics']))
  })
})
