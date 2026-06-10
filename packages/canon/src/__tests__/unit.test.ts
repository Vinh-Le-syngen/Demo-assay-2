// unit (kind: boundary) — @sys/canon. Schema default-coercion and JSON-Schema emission boundaries.
// Pure, no IO. Complements canon.test.ts (kind: pure) by pinning provenance-default coercion and the
// cross-language contract surface (toJsonSchema / allJsonSchemas) that other runtimes validate against.
import { describe, it, expect } from 'vitest'
import { RestrictedClaim, RestrictedClaimsConfig, Capability, DeliveryReadiness } from '../core'
import { KeywordEntry } from '../seo'
import { toJsonSchema, allJsonSchemas, allSchemaNames } from '../schema-export'

describe('unit/boundary — provenance + enum default coercion', () => {
  it('coerces provenance + claim defaults at the schema boundary', () => {
    // bare RestrictedClaim: severity defaults to 'high', replacement stays absent
    const rc = RestrictedClaim.parse({ phrase: 'guaranteed approval' })
    expect(rc.severity).toBe('high')
    expect(rc.replacement).toBeUndefined()

    // Capability spreads provenanceFields: status -> 'draft', arrays -> [], capability_status -> 'near_term'
    const cap = Capability.parse({ id: 'cap.trc' })
    expect(cap.status).toBe('draft')
    expect(cap.capability_status).toBe('near_term')
    expect(cap.derives_from).toEqual([])
    expect(cap.evidence).toEqual([])

    // DeliveryReadiness has conservative defaults (verify/missing) — readiness must never default optimistic
    const dr = DeliveryReadiness.parse({})
    expect(dr.legal_authority).toBe('verify')
    expect(dr.operating_playbook).toBe('missing')
    expect(dr.partner_coverage).toBe('missing')

    // KeywordEntry (SEO) defaults: intent -> informational, priority -> medium, governed_by -> {}
    const ke = KeywordEntry.parse({ keyword: 'golden visa uae', target_page: '/golden-visa' })
    expect(ke.intent).toBe('informational')
    expect(ke.priority).toBe('medium')
    expect(ke.governed_by).toEqual({})
  })

  it('emits a stable JSON-Schema surface for every named schema (cross-language contract)', () => {
    // every named schema must emit an object JSON Schema with properties — this is the contract other
    // runtimes (cadre-os python/bash) validate against, so the surface must be total and well-formed.
    const all = allJsonSchemas()
    expect(Object.keys(all).sort()).toEqual([...allSchemaNames].sort())
    for (const name of allSchemaNames) {
      const js = toJsonSchema(name)
      expect(js.type).toBe('object')
      expect(js).toHaveProperty('properties')
    }
    // restrictedClaims JSON Schema must expose its 'restricted' array property
    const rcs = toJsonSchema('restrictedClaims')
    expect((rcs.properties as Record<string, unknown>)).toHaveProperty('restricted')
  })

  it('round-trips a fully-defaulted restricted-claims config', () => {
    // empty config is valid and fills version/restricted defaults — registries start empty, not invalid
    const r = RestrictedClaimsConfig.safeParse({})
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.version).toBe(1)
      expect(r.data.restricted).toEqual([])
    }
  })
})
