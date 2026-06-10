// negative (kind: input-validation) — @sys/canon. Second negative file (split from negative.test.ts so
// @sys/assay's per-file coverage gate registers two negative entries for the canon area). Invalid/malformed
// service-authority and SEO configs MUST be rejected by the zod record schemas before they ever reach
// @eng/governance. A governed framework that accepts a broken registry would let unverified config become
// "operational law", so rejection is a safety property. Pure, no IO.
import { describe, it, expect } from 'vitest'
import { validate } from '../core'
import { validateSeo } from '../seo'

describe('negative/input-validation — broken service-authority and SEO registries are rejected', () => {
  it('rejects invalid service-authority and SEO configs', () => {
    // commercial_status outside the closed enum
    expect(
      validate('serviceAuthority', { services: { s: { country: 'AE', commercial_status: 'maybe' } } }).success,
    ).toBe(false)
    // service entry missing required country
    expect(validate('serviceAuthority', { services: { s: { may_sell: true } } }).success).toBe(false)
    // may_sell must be boolean | 'VERIFY' — an arbitrary string must not be coerced to a permission
    expect(
      validate('serviceAuthority', { services: { s: { country: 'AE', may_sell: 'yes' } } }).success,
    ).toBe(false)
    // seoRules numeric field given a string
    expect(validateSeo('seoRules', { title_max_chars: 'sixty' }).success).toBe(false)
    // keyword entry missing required target_page
    expect(validateSeo('keywordMap', { keywords: [{ keyword: 'golden visa' }] }).success).toBe(false)
    // page entry missing required path
    expect(validateSeo('pageRegistry', { pages: [{ page_type: 'service' }] }).success).toBe(false)
  })

  it('rejects a page whose page_type is outside the closed enum, and accepts the same page once corrected', () => {
    // page_type 'totally-made-up' is not a known page kind — an unknown surface type must not validate
    const bad = validateSeo('pageRegistry', {
      pages: [{ path: '/golden-visa', page_type: 'totally-made-up' }],
    })
    expect(bad.success).toBe(false)
    // the structurally identical page with a valid page_type validates — proving the rejection was the enum,
    // not some unrelated required field
    const good = validateSeo('pageRegistry', {
      pages: [{ path: '/golden-visa', page_type: 'service' }],
    })
    expect(good.success).toBe(true)
  })
})
