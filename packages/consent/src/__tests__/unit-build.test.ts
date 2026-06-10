// UNIT (pure) — buildCategories as a referentially-transparent function: total over the category
// universe, no input mutation. Split sibling of unit-decision.test.ts (same imports/setup). Two cases.
import { describe, it, expect } from 'vitest'
import {
  buildCategories,
  ALL_CONSENT_CATEGORIES,
  type ConsentCategory,
} from '../index'

// UNIT 2 — buildCategories is a total function over the category universe: every id present,
// exactly the requested non-essential set + the essential one granted, no input mutation.
describe('unit: buildCategories is total and non-mutating', () => {
  it('emits a choice for every id in the universe and no extras', () => {
    const m = buildCategories(ALL_CONSENT_CATEGORIES, ['marketing'])
    expect(Object.keys(m).sort()).toEqual([...ALL_CONSENT_CATEGORIES].sort())
  })

  it('does not mutate the granted-input array', () => {
    const granted: ConsentCategory[] = ['analytics', 'support']
    const snapshot = [...granted]
    buildCategories(ALL_CONSENT_CATEGORIES, granted)
    expect(granted).toEqual(snapshot)
  })
})
