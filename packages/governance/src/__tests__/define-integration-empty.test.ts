// Integration (intra-system) — split from define-integration.test.ts. Asserts the composition root
// degrades to inert-but-non-throwing deciders when no registries are injected, and that a custom
// scanExclude is wired all the way through the composition into the scanner. Exercises define.ts
// (the wiring) against decide.ts, which no pure-unit test covers.

import { describe, it, expect } from 'vitest'
import { defineGovernance } from '../define'

describe('defineGovernance — empty config yields inert, non-throwing deciders', () => {
  it('returns empty decisions when no registries are injected', () => {
    const g = defineGovernance()
    expect(g.restricted).toEqual([])
    expect(g.approved).toEqual([])
    expect(g.capabilities).toEqual([])
    expect(g.scan([{ path: 'a.html', text: 'guaranteed approval' }])).toEqual([])
    expect(g.linkClaims()).toEqual([])
    expect(g.sellableServices()).toEqual([])
    expect(g.unresolvedServiceAuthority()).toEqual([])
  })

  it('honors a custom scanExclude wired through the composition root', () => {
    const g = defineGovernance({
      restricted: { version: 1, restricted: [{ phrase: 'guaranteed approval', severity: 'critical' }] },
      scanExclude: /draft\//,
    })
    // excluded path is skipped; non-excluded path is scanned
    expect(g.scan([{ path: 'draft/home.html', text: 'guaranteed approval' }])).toHaveLength(0)
    expect(g.scan([{ path: 'live/home.html', text: 'guaranteed approval' }])).toHaveLength(1)
  })
})
