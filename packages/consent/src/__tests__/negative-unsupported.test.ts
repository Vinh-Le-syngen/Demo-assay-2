// NEGATIVE (input-validation | unsupported) — an unsupported / unknown category id fed to the
// decision engine must fail SAFE: treated as a non-grant, vendors in it blocked on consent
// grounds. Split sibling of negative-input.test.ts (same imports/setup). One case.
import { describe, it, expect } from 'vitest'
import {
  canUse,
  canLoadVendor,
  buildCategories,
  ALL_CONSENT_CATEGORIES,
  type ConsentContext,
  type ConsentCategory,
} from '../index'

const POLICY = '2026-06'
const REG = '1'

// NEGATIVE 2 (unsupported) — an unsupported / unknown category id (not in the vocabulary) must
// be treated as a non-grant, and a vendor declared against it must not load on consent grounds.
describe('negative: unsupported category id is denied by default', () => {
  it('unknown category → canUse false; vendor in unknown category blocked', () => {
    const ctx: ConsentContext = {
      decision: {
        policyVersion: POLICY,
        registryVersion: REG,
        categories: buildCategories(ALL_CONSENT_CATEGORIES, ['analytics']),
        decidedAt: '2026-06-06T00:00:00.000Z',
      },
      policyVersion: POLICY,
      registryVersion: REG,
    }
    const bogus = 'tracking_pixels' as ConsentCategory // not in the vocabulary
    expect(canUse(bogus, ctx)).toBe(false)
    expect(canLoadVendor({ category: bogus, required: false }, ctx)).toBe(false)
    // …but a required vendor in an unknown category still loads (operational override is by `required`,
    // not by category), proving the unknown-category denial is purely a consent-grounds denial.
    expect(canLoadVendor({ category: bogus, required: true }, ctx)).toBe(true)
  })
})
