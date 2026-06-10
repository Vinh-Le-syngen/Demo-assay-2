// governance (kind: risk-mapping) — @sys/canon. The honesty contract of a governed framework: a service may
// only be marked commercially sellable, and a public claim may only be approved, when it is BACKED by a live
// capability in the inventory. The canon records encode this via fields (commercial_status, may_sell,
// requires_capabilities, capability_status, RowStatus). These tests assert that the record schemas make
// honest backing EXPRESSIBLE and dishonest backing DETECTABLE — i.e. the data needed to enforce the risk
// mapping (claim/service -> capability) is faithfully preserved and never optimistically defaulted.
// Pure, no IO. Author qa, reviewer infra — compliance-critical claim gating.
import { describe, it, expect } from 'vitest'
import { CapabilityInventoryConfig, ApprovedClaimsConfig, ServiceAuthorityConfig } from '../core'

describe('governance/risk-mapping — claim/service honesty is backed by live capabilities', () => {
  it('service authority defaults are conservative (fail-closed): not_sellable + VERIFY', () => {
    // a freshly-declared service must NOT be sellable by default — selling requires an explicit decision
    const e = ServiceAuthorityConfig.safeParse({ services: { 'will.AE': { country: 'AE' } } })
    expect(e.success).toBe(true)
    if (!e.success) return
    const s = e.data.services['will.AE']
    expect(s).toBeDefined()
    expect(s?.commercial_status).toBe('not_sellable')
    expect(s?.may_sell).toBe('VERIFY')
    expect(s?.status).toBe('draft') // provenance also defaults to draft, not live
  })

  it('detects an UNBACKED approved claim (claim requires a capability absent from the inventory)', () => {
    const inv = CapabilityInventoryConfig.safeParse({
      capabilities: [{ id: 'cap.golden_visa', capability_status: 'live', status: 'live' }],
    })
    const claims = ApprovedClaimsConfig.safeParse({
      claims: [
        // honest: backed by a live capability that exists
        { id: 'ok', text: 'We file golden visas', requires_capabilities: ['cap.golden_visa'], status: 'live' },
        // dishonest: requires a capability that is NOT in the inventory
        { id: 'bad', text: 'We guarantee citizenship', requires_capabilities: ['cap.citizenship'], status: 'live' },
      ],
    })
    expect(inv.success && claims.success).toBe(true)
    if (!(inv.success && claims.success)) return

    const liveCapIds = new Set(
      inv.data.capabilities.filter((c) => c.capability_status === 'live').map((c) => c.id),
    )
    const unbacked = claims.data.claims.filter(
      (c) => !c.requires_capabilities.every((id) => liveCapIds.has(id)),
    )
    // the risk mapping is detectable: exactly the 'bad' claim is unbacked
    expect(unbacked.map((c) => c.id)).toEqual(['bad'])
  })

  it('a non-live capability cannot honestly back a live public claim', () => {
    const inv = CapabilityInventoryConfig.safeParse({
      capabilities: [{ id: 'cap.trc', capability_status: 'near_term', status: 'provisional' }],
    })
    const claims = ApprovedClaimsConfig.safeParse({
      claims: [{ id: 'trc', text: 'TRC issued instantly', requires_capabilities: ['cap.trc'], status: 'live' }],
    })
    expect(inv.success && claims.success).toBe(true)
    if (!(inv.success && claims.success)) return

    const byId = new Map(inv.data.capabilities.map((c) => [c.id, c]))
    const claim = claims.data.claims[0]
    expect(claim).toBeDefined()
    if (!claim) return
    const backingLive = claim.requires_capabilities.every(
      (id) => byId.get(id)?.capability_status === 'live',
    )
    // a 'live' claim backed only by a 'near_term' capability is NOT honestly backed — gate must catch it
    expect(claim.status).toBe('live')
    expect(backingLive).toBe(false)
  })
})
