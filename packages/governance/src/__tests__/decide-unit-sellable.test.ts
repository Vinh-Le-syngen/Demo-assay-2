// Unit (pure) — split from decide-unit.test.ts. Pins the AND-of-readiness contract of
// commerciallySellable across each individual readiness lever, independent of any composition.
// Pure function over a plain record — no IO, no @sys/canon parse — so it belongs at the unit layer.

import { describe, it, expect } from 'vitest'
import type { ServiceAuthorityEntry } from '@sys/canon'
import { commerciallySellable } from '../decide'

const ready = {
  legal_authority: 'ready',
  operating_playbook: 'ready',
  partner_coverage: 'ready',
  document_requirements: 'ready',
  customer_support: 'ready',
  failure_modes: 'ready',
} as const

const sellableEntry: ServiceAuthorityEntry = {
  country: 'AE',
  may_sell: true,
  requires_partner: false,
  commercial_status: 'sellable',
  status: 'live',
  derives_from: [],
  evidence: [],
  delivery_readiness: { ...ready },
}

describe('commerciallySellable — AND across every gate (pure)', () => {
  it('is true only when permitted AND all required readiness levers are ready', () => {
    expect(commerciallySellable(sellableEntry)).toBe(true)
  })

  it('any single blocking lever flips it to false', () => {
    // permission levers
    expect(commerciallySellable({ ...sellableEntry, may_sell: false })).toBe(false)
    expect(commerciallySellable({ ...sellableEntry, may_sell: 'VERIFY' })).toBe(false)
    expect(commerciallySellable({ ...sellableEntry, requires_partner: 'VERIFY' })).toBe(false)
    // each required readiness lever, one at a time
    expect(commerciallySellable({ ...sellableEntry, delivery_readiness: { ...ready, legal_authority: 'partial' } })).toBe(false)
    expect(commerciallySellable({ ...sellableEntry, delivery_readiness: { ...ready, operating_playbook: 'missing' } })).toBe(false)
    expect(commerciallySellable({ ...sellableEntry, delivery_readiness: { ...ready, document_requirements: 'verify' } })).toBe(false)
    expect(commerciallySellable({ ...sellableEntry, delivery_readiness: { ...ready, failure_modes: 'missing' } })).toBe(false)
  })

  it('failure_modes is a non-missing gate (partial/verify still permitted) while the readiness trio must be exactly ready', () => {
    // failure_modes only blocks when 'missing'
    expect(commerciallySellable({ ...sellableEntry, delivery_readiness: { ...ready, failure_modes: 'partial' } })).toBe(true)
    expect(commerciallySellable({ ...sellableEntry, delivery_readiness: { ...ready, failure_modes: 'verify' } })).toBe(true)
    // partner_coverage is NOT part of the sellable gate → a non-ready value does not block
    expect(commerciallySellable({ ...sellableEntry, delivery_readiness: { ...ready, partner_coverage: 'missing' } })).toBe(true)
  })

  it('a missing delivery_readiness object is treated as not deliverable (defensive default)', () => {
    const { delivery_readiness: _omit, ...noReadiness } = sellableEntry
    expect(commerciallySellable(noReadiness as ServiceAuthorityEntry)).toBe(false)
  })
})
