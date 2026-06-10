// Adversarial (prompt-injection / protocol-misuse) — split from scan-adversarial.test.ts. A content-gen
// agent trying to slip a forbidden marketing pattern past the SEO gate by case-mangling, and by hiding it
// in a field (title vs description) the author hoped would not be scanned. The forbidden-pattern gate must
// resist case evasion across every scanned field.

import { describe, it, expect } from 'vitest'
import { SeoRulesConfig } from '@sys/canon'
import { seoRulesGate } from '../seo-gates'

describe('seoRulesGate — forbidden-pattern gate resists case evasion (adversarial)', () => {
  it('flags a forbidden marketing pattern hidden behind upper-casing in the meta description', () => {
    const rules = SeoRulesConfig.parse({ forbidden_patterns: ['guaranteed approval'] })
    const issues = seoRulesGate({ path: '/x', title: 'Company Formation', description: 'GUARANTEED APPROVAL fast' }, rules)
    expect(issues.some((i) => i.detail.includes('forbidden') && i.severity === 'high')).toBe(true)
  })

  it('catches a forbidden pattern injected via the title field too', () => {
    const rules = SeoRulesConfig.parse({ forbidden_patterns: ['guaranteed approval'] })
    const issues = seoRulesGate({ path: '/y', title: 'GuArAnTeEd ApProVaL', description: 'clean copy' }, rules)
    expect(issues.some((i) => i.detail.includes('forbidden'))).toBe(true)
  })

  it('does not fire on clean copy across both fields (no false positive that would mask evasion)', () => {
    const rules = SeoRulesConfig.parse({ forbidden_patterns: ['guaranteed approval'] })
    const issues = seoRulesGate({ path: '/z', title: 'Company Formation in the UAE', description: 'Compliant, partner-backed support' }, rules)
    expect(issues.some((i) => i.detail.includes('forbidden'))).toBe(false)
  })
})
