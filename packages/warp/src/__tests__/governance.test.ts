// Governance (process): warp is a config-invariant GATE. The contract a project relies
// on for merge governance is: (1) every registered check is executed exactly once, even
// when earlier ones fail; (2) the gate is "clean" iff the total error count across ALL
// checks is zero; (3) one check's failure never suppresses another's findings. These
// properties are what make warp safe as a pre-merge policy gate. Real exported APIs only.
import { describe, it, expect } from 'vitest'
import { defineWarp, runWarp } from '../core'

describe('warp governance — the cross-validation gate contract', () => {
  it('executes every registered check exactly once, regardless of prior failures', async () => {
    const ran: string[] = []
    const config = defineWarp({
      checks: [
        { name: 'a', run: () => { ran.push('a'); return ['boom'] } }, // fails first
        { name: 'b', run: () => { ran.push('b'); return [] } },
        { name: 'c', run: async () => { ran.push('c'); return ['also'] } },
      ],
    })
    const report = await runWarp(config)
    // Process invariant: all checks ran, once each, in registration order.
    expect(ran).toEqual(['a', 'b', 'c'])
    // A failing first check did not short-circuit the gate.
    expect(report.results).toHaveLength(3)
    // No finding is lost: aggregate equals the sum of per-check findings.
    expect(report.errorCount).toBe(2)
  })
})
