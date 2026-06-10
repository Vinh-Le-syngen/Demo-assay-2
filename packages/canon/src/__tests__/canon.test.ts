import { describe, it, expect } from 'vitest'
import { validate, GATE_POLICY, DEFAULT_CLAIM_EXCLUDE, ApprovedClaim, ServiceAuthorityEntry } from '../core'
import { validateSeo, PageEntry } from '../seo'
import { toJsonSchema, allJsonSchemas, allSchemaNames } from '../schema-export'

describe('schemas / validate', () => {
  it('accepts a valid choices config and rejects a broken one', () => {
    expect(validate('choices', { version: 1, apex_bet: { statement: 's' }, wedge: { country: 'AE' } }).success).toBe(true)
    expect(validate('choices', { version: 1, wedge: { country: 'AE' } }).success).toBe(false)
  })

  it('parses provenance defaults on an approved claim', () => {
    const c = ApprovedClaim.parse({ id: 'c1', text: 'x' })
    expect(c.status).toBe('draft')
    expect(c.requires_capabilities).toEqual([])
  })

  it('parses service authority with readiness + VERIFY', () => {
    const e = ServiceAuthorityEntry.parse({ country: 'AE', may_sell: 'VERIFY' })
    expect(e.commercial_status).toBe('not_sellable')
    expect(e.may_sell).toBe('VERIFY')
  })

  it('validates SEO schemas', () => {
    expect(validateSeo('seoRules', { forbidden_patterns: ['guaranteed approval'] }).success).toBe(true)
    const p = PageEntry.parse({ path: '/x' })
    expect(p.indexable).toBe(true)
    expect(p.launch_status).toBe('draft')
  })
})

describe('policy data', () => {
  it('GATE_POLICY: claim-scan blocks deploy; freshness does not', () => {
    expect(GATE_POLICY['claim-scan'].blocksDeploy).toBe(true)
    expect(GATE_POLICY.freshness.blocksDeploy).toBe(false)
  })
  it('DEFAULT_CLAIM_EXCLUDE matches legal pages', () => {
    expect(DEFAULT_CLAIM_EXCLUDE.test('app/terms/page.tsx')).toBe(true)
    expect(DEFAULT_CLAIM_EXCLUDE.test('app/home/page.tsx')).toBe(false)
  })
})

describe('JSON Schema emission (cross-language contract)', () => {
  it('emits a JSON Schema object per named schema', () => {
    const js = toJsonSchema('choices')
    expect(js).toHaveProperty('type', 'object')
    expect(js).toHaveProperty('properties')
  })
  it('emits all schemas (core + SEO)', () => {
    const all = allJsonSchemas()
    expect(Object.keys(all).sort()).toEqual([...allSchemaNames].sort())
    expect(allSchemaNames).toContain('serviceAuthority')
    expect(allSchemaNames).toContain('pageRegistry')
  })
})
