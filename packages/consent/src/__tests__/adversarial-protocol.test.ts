// ADVERSARIAL (protocol-misuse) — a caller attempting to coax a grant out of the engine by
// abusing the decision contract: replaying a stale-but-grant-laden decision, and spoofing a
// vendor's category/required flags to dodge the consent gate. The engine must not be fooled.
import { describe, it, expect } from 'vitest'
import {
  canLoadVendor,
  buildCategories,
  ALL_CONSENT_CATEGORIES,
  type ConsentContext,
} from '../index'

const CURRENT_POLICY = '2026-06'
const CURRENT_REG = '2'

// ADVERSARIAL 2 (protocol-misuse) — category/required spoofing: a vendor that is genuinely
// marketing tries to load while the subject granted ONLY analytics. Mislabeling its category as
// 'analytics' would smuggle it through, but the gate decides on the category it is ASKED about —
// so a truthful marketing vendor stays blocked, and the `required` flag (not consent) is the only
// legitimate override. We also confirm a country gate cannot be bypassed by the required flag.
describe('adversarial: a vendor cannot smuggle itself past the consent gate', () => {
  const ctx: ConsentContext = {
    decision: {
      policyVersion: CURRENT_POLICY,
      registryVersion: CURRENT_REG,
      categories: buildCategories(ALL_CONSENT_CATEGORIES, ['analytics']), // ONLY analytics granted
      decidedAt: '2026-06-06T00:00:00.000Z',
    },
    policyVersion: CURRENT_POLICY,
    registryVersion: CURRENT_REG,
  }

  it('a truthful marketing vendor stays blocked under analytics-only consent', () => {
    expect(canLoadVendor({ category: 'marketing', required: false }, ctx)).toBe(false)
  })

  it('country exclusion is not overridable by the required flag (defense in depth)', () => {
    const vendor = { category: 'marketing' as const, required: true, countries: ['AE'] }
    // Even a required vendor must not run where it is geographically disabled.
    expect(canLoadVendor(vendor, ctx, 'VN')).toBe(false)
    expect(canLoadVendor(vendor, ctx, 'AE')).toBe(true)
  })
})
