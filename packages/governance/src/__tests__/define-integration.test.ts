// Integration (intra-system) — defineGovernance composed over injected @sys/canon registries. Asserts
// the composition root wires the deciders to the SAME validated records: a restricted registry feeds the
// scanner, the approved-claims + capability inventories feed the linker, and the service-authority registry
// drives BOTH unresolved() and sellableServices() consistently. This exercises define.ts + decide.ts + the
// canon schemas together (validation → decision), which no single pure-unit test covers.

import { describe, it, expect } from 'vitest'
import { defineGovernance } from '../define'

const ready = {
  legal_authority: 'ready',
  operating_playbook: 'ready',
  document_requirements: 'ready',
  failure_modes: 'ready',
}

describe('defineGovernance — composed decision surface over injected registries', () => {
  const g = defineGovernance({
    restricted: { version: 1, restricted: [{ phrase: 'guaranteed approval', severity: 'critical' }] },
    approved: {
      version: 1,
      claims: [
        { id: 'c.live', text: 'guided formation', requires_capabilities: ['cap.f'] },
        { id: 'c.ghost', text: 'autopilot', requires_capabilities: ['cap.missing'] },
      ],
    },
    capabilities: { version: 1, capabilities: [{ id: 'cap.f', capability_status: 'live' }] },
    serviceAuthority: {
      version: 1,
      services: {
        // permitted + fully deliverable → sellable, resolved
        formation: { country: 'AE', may_sell: true, requires_partner: false, delivery_readiness: { ...ready } },
        // permitted but not deliverable → resolved (no VERIFY) yet NOT sellable
        notary: { country: 'AE', may_sell: true, requires_partner: false, delivery_readiness: { ...ready, legal_authority: 'partial' } },
        // unresolved: may_sell VERIFY
        will: { country: 'AE', may_sell: 'VERIFY' },
      },
    },
  })

  it('routes the restricted registry into the scanner', () => {
    expect(g.scan([{ path: 'web/home.html', text: 'guaranteed approval today' }])).toHaveLength(1)
    expect(g.scan([{ path: 'web/home.html', text: 'fully compliant support' }])).toHaveLength(0)
  })

  it('links approved claims against the SAME capability inventory (missing cap surfaces)', () => {
    const issues = g.linkClaims()
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ claim_id: 'c.ghost', kind: 'missing_capability', capability: 'cap.missing' })
  })

  it('drives sellable vs unresolved from one service-authority registry, consistently', () => {
    // sellable requires permission AND deliverability — only formation qualifies
    expect(g.sellableServices()).toEqual(['formation'])
    // unresolved is purely about VERIFY cells — only `will`; notary is resolved-but-unsellable
    expect(g.unresolvedServiceAuthority()).toEqual(['will'])
    // the two surfaces are independent: notary appears in neither
    expect(g.sellableServices()).not.toContain('notary')
    expect(g.unresolvedServiceAuthority()).not.toContain('notary')
  })
})
