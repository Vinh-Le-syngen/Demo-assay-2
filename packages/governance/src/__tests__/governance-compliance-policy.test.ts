// Governance (risk-mapping) — the compliance POLICY contract of the Control plane, expressed end-to-end
// over a realistic venture registry set. Pins the non-negotiable risk rules that protect the business:
//   1. No public claim may ship without a LIVE/ASSISTED capability behind it (positive-permission backing).
//   2. A service is commercially sellable ONLY when permission AND operational deliverability both hold
//      (sell-what-we-can-deliver) — a VERIFY or partial readiness cell must withhold the sale.
//   3. Non-live or VERIFY/provisional pages must NOT be indexable, and regulated pages must stay fresh
//      (SEO verdicts that prevent unreviewed compliance copy from being crawled).
// This complements the existing authz-policy governance test by mapping each gate to the risk it controls.

import { describe, it, expect } from 'vitest'
import type { PageEntry } from '@sys/canon'
import { defineGovernance } from '../define'
import { noindexGate, freshnessGate } from '../seo-gates'

const ready = {
  legal_authority: 'ready',
  operating_playbook: 'ready',
  document_requirements: 'ready',
  failure_modes: 'ready',
}

// One venture's governance spine: claims, the capabilities that back them, and the service registry.
const venture = defineGovernance({
  restricted: { version: 1, restricted: [{ phrase: 'guaranteed approval', severity: 'critical' }] },
  approved: {
    version: 1,
    claims: [
      // backed by a live capability — permitted to ship
      { id: 'claim.formation', text: 'guided company formation', requires_capabilities: ['cap.formation'] },
      // backed only by a not-yet-live capability — MUST be flagged, would be an unbacked public claim
      { id: 'claim.autopilot', text: 'fully automated golden visa', requires_capabilities: ['cap.autopilot'] },
    ],
  },
  capabilities: {
    version: 1,
    capabilities: [
      { id: 'cap.formation', capability_status: 'live' },
      { id: 'cap.autopilot', capability_status: 'near_term' },
    ],
  },
  serviceAuthority: {
    version: 1,
    services: {
      formation: { country: 'AE', may_sell: true, requires_partner: false, delivery_readiness: { ...ready } },
      // permitted but operationally not deliverable (legal authority only partial) → must NOT be sellable
      golden_visa: { country: 'AE', may_sell: true, requires_partner: false, delivery_readiness: { ...ready, legal_authority: 'partial' } },
      // unverified authority → unresolved, must NOT be sellable
      will: { country: 'AE', may_sell: 'VERIFY' },
    },
  },
})

describe('GOVERNANCE: claim → capability backing (risk: unbacked public claim)', () => {
  it('flags exactly the claim whose capability is not live/assisted', () => {
    const issues = venture.linkClaims()
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ claim_id: 'claim.autopilot', kind: 'capability_not_live', severity: 'high' })
    // the live-backed claim raises no issue — it is permitted to ship
    expect(issues.some((i) => i.claim_id === 'claim.formation')).toBe(false)
  })
})

describe('GOVERNANCE: commercial sellability = permission AND deliverability (risk: selling what we cannot deliver)', () => {
  it('only the fully permitted-and-deliverable service is sellable', () => {
    expect(venture.sellableServices()).toEqual(['formation'])
    // partial legal authority withholds the sale even though may_sell is true
    expect(venture.sellableServices()).not.toContain('golden_visa')
    // unverified authority is neither sellable nor silently resolved
    expect(venture.sellableServices()).not.toContain('will')
    expect(venture.unresolvedServiceAuthority()).toContain('will')
  })
})

describe('GOVERNANCE: SEO indexing verdicts (risk: crawling unreviewed compliance copy)', () => {
  const live: PageEntry = {
    path: '/services/formation',
    page_type: 'service',
    canonical: true,
    indexable: true,
    target_keywords: ['company formation'],
    required_claims: [],
    required_capabilities: [],
    launch_status: 'live',
    status: 'live',
    derives_from: [],
    evidence: [],
    last_reviewed: '2026-06-01',
  }

  it('blocks indexing of a non-live page and of a VERIFY-status page', () => {
    expect(noindexGate([{ ...live, launch_status: 'draft' }])).toHaveLength(1)
    expect(noindexGate([{ ...live, status: 'verify' }])).toHaveLength(1)
    // a genuinely live + approved page is allowed to be indexable
    expect(noindexGate([live])).toHaveLength(0)
  })

  it('flags a regulated page whose review is stale beyond the policy window', () => {
    const stale = freshnessGate([{ ...live, last_reviewed: '2025-01-01' }], { now: Date.parse('2026-06-06'), maxAgeDays: 180 })
    expect(stale).toHaveLength(1)
    expect(stale[0]).toMatchObject({ gate: 'freshness', path: '/services/formation' })
    // within-window review passes
    expect(freshnessGate([live], { now: Date.parse('2026-06-06'), maxAgeDays: 180 })).toHaveLength(0)
  })
})
