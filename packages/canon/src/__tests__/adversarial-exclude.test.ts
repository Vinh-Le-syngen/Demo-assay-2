// adversarial (kind: protocol-misuse) — @sys/canon. DEFAULT_CLAIM_EXCLUDE is policy DATA: it tells the
// restricted-claims scan which file paths to SKIP (legal/disclaimer surfaces that legitimately negate
// restricted phrases). An attacker who can name a page controls whether their marketing copy is scanned.
// The adversarial property: the exclusion must be TIGHT — it must skip genuine legal surfaces but must NOT
// be tricked into skipping a marketing/indexable page that has been dressed up to look legal in order to
// smuggle restricted claims past the scanner. Pure, no IO.
import { describe, it, expect } from 'vitest'
import { DEFAULT_CLAIM_EXCLUDE } from '../core'

describe('adversarial/protocol-misuse — claim-scan exclusion cannot be evaded by path dressing', () => {
  it('skips only genuine legal/disclaimer surfaces', () => {
    // these are the surfaces the exclusion is FOR — they must be skipped
    for (const p of [
      'app/terms/page.tsx',
      'app/privacy/page.tsx',
      'app/legal',
      'app/cookies/page.tsx',
      'app/cookie/page.tsx',
      'app/consent.tsx',
      'app/data-use/page.tsx',
      'app/security/page.tsx',
    ]) {
      expect(DEFAULT_CLAIM_EXCLUDE.test(p)).toBe(true)
    }
  })

  it('does NOT skip marketing pages dressed to look legal (smuggling restricted claims)', () => {
    // attacker tries to evade the scan by prefixing/suffixing a legal word onto a marketing slug.
    // The boundary `([/.]|$)` means a legal word only excludes when it ends the segment — so these
    // attacker-controlled indexable pages must STILL be scanned (exclusion returns false).
    for (const p of [
      'app/terms-guaranteed-approval/page.tsx', // legal prefix glued to a restricted phrase
      'app/privacy-and-fastest-visa-ever/page.tsx',
      'app/our-legalese/page.tsx', // "legal" as a substring, not a real legal page
      'app/legalize-your-stay/page.tsx',
      'app/securely-guaranteed/page.tsx', // "secur..." substring, not "security" segment
      'app/consentual-marketing/page.tsx',
      'app/home/page.tsx', // ordinary marketing page
      'app/golden-visa/page.tsx',
      'app/pricing/page.tsx',
    ]) {
      expect(DEFAULT_CLAIM_EXCLUDE.test(p)).toBe(false)
    }
  })

  it('is anchored to path segments, not arbitrary substrings, in both directions', () => {
    // genuine legal page deeper in a tree is still excluded (segment ends with `/`)
    expect(DEFAULT_CLAIM_EXCLUDE.test('app/(marketing)/legal/page.tsx')).toBe(true)
    // but a marketing page that merely *contains* a legal word mid-segment is not excluded
    expect(DEFAULT_CLAIM_EXCLUDE.test('app/terminator/page.tsx')).toBe(false)
  })
})
