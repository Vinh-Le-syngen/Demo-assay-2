// integration (kind: intra-system) — @sys/canon. There is no defineCanon() runtime in this package;
// the canon is the COMPOSITION of named record schemas. These tests compose multiple canon validators
// over a single injected venture "registry bundle" (capability inventory + approved claims + service
// authority + page registry) and assert the cross-record invariants a governed framework depends on:
// claim->capability backing and page->claim/capability backing. The links are encoded in record fields
// (requires_capabilities, required_claims, required_capabilities); composing the validated records is the
// only honest integration surface canon exposes. Pure, no IO.
import { describe, it, expect } from 'vitest'
import { CapabilityInventoryConfig, ApprovedClaimsConfig, ServiceAuthorityConfig } from '../core'
import { PageRegistryConfig } from '../seo'

// An injected venture registry bundle (what @eng/governance would be handed).
const bundle = {
  capabilityInventory: {
    capabilities: [
      { id: 'cap.golden_visa', capability_status: 'live', status: 'live' },
      { id: 'cap.trc', capability_status: 'assisted', status: 'approved' },
    ],
  },
  approvedClaims: {
    claims: [
      {
        id: 'claim.gv',
        text: 'We file UAE Golden Visa applications end to end',
        allowed_surfaces: ['/golden-visa'],
        requires_capabilities: ['cap.golden_visa'],
        status: 'live',
      },
    ],
  },
  serviceAuthority: {
    services: {
      'golden_visa.AE': { country: 'AE', may_sell: true, commercial_status: 'sellable', status: 'live' },
    },
  },
  pageRegistry: {
    pages: [
      {
        path: '/golden-visa',
        page_type: 'service',
        required_claims: ['claim.gv'],
        required_capabilities: ['cap.golden_visa'],
        launch_status: 'live',
      },
    ],
  },
}

describe('integration/intra-system — canon validators composed over an injected registry bundle', () => {
  it('every record in the bundle validates, then claim->capability backing holds across records', () => {
    const cap = CapabilityInventoryConfig.safeParse(bundle.capabilityInventory)
    const claims = ApprovedClaimsConfig.safeParse(bundle.approvedClaims)
    const svc = ServiceAuthorityConfig.safeParse(bundle.serviceAuthority)
    const pages = PageRegistryConfig.safeParse(bundle.pageRegistry)
    expect(cap.success && claims.success && svc.success && pages.success).toBe(true)
    if (!(cap.success && claims.success && svc.success && pages.success)) return

    // claim->capability link: every capability a claim requires must exist in the inventory (the honesty anchor)
    const capIds = new Set(cap.data.capabilities.map((c) => c.id))
    for (const claim of claims.data.claims) {
      for (const need of claim.requires_capabilities) {
        expect(capIds.has(need)).toBe(true)
      }
    }

    // page->claim and page->capability backing: a live page may only require claims/capabilities that exist
    const claimIds = new Set(claims.data.claims.map((c) => c.id))
    for (const page of pages.data.pages) {
      for (const rc of page.required_claims) expect(claimIds.has(rc)).toBe(true)
      for (const rcap of page.required_capabilities) expect(capIds.has(rcap)).toBe(true)
    }
  })
})
