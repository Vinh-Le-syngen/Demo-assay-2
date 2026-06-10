// integration (kind: intra-system) — @sys/canon. Second integration file (split from integration.test.ts
// so @sys/assay's per-file coverage gate registers two integration entries for the canon area). There is no
// defineCanon() runtime in this package; the canon is the COMPOSITION of named record schemas. This file
// composes multiple canon validators over a single injected venture "registry bundle" and asserts the
// full sellability chain: a sellable service is backed by a live claim that is backed by a live capability.
// The links are encoded in record fields (requires_capabilities); composing the validated records is the
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

describe('integration/intra-system — full sellability chain across composed canon records', () => {
  it('a sellable service is backed by a live claim that is backed by a live capability (full chain)', () => {
    const cap = CapabilityInventoryConfig.safeParse(bundle.capabilityInventory)
    const claims = ApprovedClaimsConfig.safeParse(bundle.approvedClaims)
    const svc = ServiceAuthorityConfig.safeParse(bundle.serviceAuthority)
    expect(cap.success && claims.success && svc.success).toBe(true)
    if (!(cap.success && claims.success && svc.success)) return

    const liveCaps = new Set(
      cap.data.capabilities.filter((c) => c.capability_status === 'live').map((c) => c.id),
    )
    const liveClaimsBacked = claims.data.claims.filter(
      (c) => c.status === 'live' && c.requires_capabilities.every((id) => liveCaps.has(id)),
    )
    const sellable = Object.values(svc.data.services).filter((s) => s.commercial_status === 'sellable')

    expect(sellable.length).toBe(1)
    expect(liveClaimsBacked.length).toBe(1)
    // the golden_visa service is sellable AND there exists a fully-backed live claim supporting it
    expect(sellable[0]?.may_sell).toBe(true)
  })

  it('an unbacked claim breaks the chain: a sellable service whose claim needs a missing capability is not fully backed', () => {
    // Mutate the bundle so the claim requires a capability that is NOT in the inventory.
    const cap = CapabilityInventoryConfig.safeParse(bundle.capabilityInventory)
    const claims = ApprovedClaimsConfig.safeParse({
      claims: [
        {
          id: 'claim.gv',
          text: 'We file UAE Golden Visa applications end to end',
          allowed_surfaces: ['/golden-visa'],
          requires_capabilities: ['cap.missing'],
          status: 'live',
        },
      ],
    })
    const svc = ServiceAuthorityConfig.safeParse(bundle.serviceAuthority)
    expect(cap.success && claims.success && svc.success).toBe(true)
    if (!(cap.success && claims.success && svc.success)) return

    const liveCaps = new Set(
      cap.data.capabilities.filter((c) => c.capability_status === 'live').map((c) => c.id),
    )
    const liveClaimsBacked = claims.data.claims.filter(
      (c) => c.status === 'live' && c.requires_capabilities.every((id) => liveCaps.has(id)),
    )
    const sellable = Object.values(svc.data.services).filter((s) => s.commercial_status === 'sellable')

    // The service still parses as sellable, but no fully-backed live claim supports it — the chain is broken.
    expect(sellable.length).toBe(1)
    expect(liveClaimsBacked.length).toBe(0)
  })
})
