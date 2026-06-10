// Unit (pure) — the boundary semantics of the pure claim→capability linker, independent of any
// composition. Pins the `allow` policy override (assisted accepted/rejected on demand). This is a
// pure function over plain records — no IO, no @sys/canon parse — so it belongs at the unit layer.
// (The commerciallySellable readiness contract lives in decide-unit-sellable.test.ts.)

import { describe, it, expect } from 'vitest'
import type { ApprovedClaim, Capability, CapabilityStatus } from '@sys/canon'
import { linkClaims } from '../decide'

const claim = (requires: string[]): ApprovedClaim => ({
  id: 'c.x',
  text: 'x',
  allowed_surfaces: [],
  requires_capabilities: requires,
  prohibited_variants: [],
  status: 'approved',
  derives_from: [],
  evidence: [],
})
const cap = (id: string, status: CapabilityStatus): Capability => ({
  id,
  capability_status: status,
  status: 'live',
  derives_from: [],
  evidence: [],
})

describe('linkClaims — capability-status allow policy (pure)', () => {
  it('uses the default allow-set (live + assisted) and rejects near_term', () => {
    const caps = [cap('cap.a', 'assisted'), cap('cap.n', 'near_term')]
    // assisted is allowed by default → no issue
    expect(linkClaims([claim(['cap.a'])], caps)).toHaveLength(0)
    // near_term is not in the default allow-set → capability_not_live
    expect(linkClaims([claim(['cap.n'])], caps)[0]).toMatchObject({
      kind: 'capability_not_live',
      capability: 'cap.n',
      severity: 'high',
    })
  })

  it('respects an injected allow-set that excludes assisted', () => {
    const caps = [cap('cap.a', 'assisted')]
    const strict: CapabilityStatus[] = ['live']
    // same claim that previously passed now fails because assisted is no longer allowed
    expect(linkClaims([claim(['cap.a'])], caps)).toHaveLength(0)
    const issues = linkClaims([claim(['cap.a'])], caps, { allow: strict })
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ kind: 'capability_not_live', capability: 'cap.a' })
  })
})
