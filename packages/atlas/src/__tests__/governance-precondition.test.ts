import { describe, it, expect } from 'vitest'
import { validateGraph, type DependencyGraph } from '../core'

// Governance (compliance): atlas IS a guard. This file pins the PRECONDITION policy — the guard
// refuses to render a verdict on a structurally invalid graph, so validateGraph is the gate that
// must pass before any propagationGaps verdict can be trusted. Split out of governance.test.ts,
// which keeps the propagation-guard coverage policy itself.

describe('governance precondition: the guard refuses to operate on a structurally invalid graph', () => {
  it('validateGraph is the gate that must pass before a verdict can be trusted', () => {
    // A graph whose coupling points at a non-existent target is not a safe basis for a guard
    // verdict — validateGraph must surface it so CI blocks on graph integrity first.
    const drifted: DependencyGraph = {
      files: { 'config/pricing.ts': { impacts: [{ target: 'engine/REMOVED.ts' }] } },
    }
    expect(validateGraph(drifted)).toContain(
      "[config/pricing.ts] impact target not in graph: 'engine/REMOVED.ts'",
    )
  })

  it('a structurally valid declared coupling produces no precondition errors', () => {
    // The mirror of the above: when every declared target exists, the integrity gate is clean,
    // so a verdict from this graph is trustworthy.
    const sound: DependencyGraph = {
      files: {
        'config/pricing.ts': { impacts: [{ target: 'engine/tax.ts' }] },
        'engine/tax.ts': { criticality: 'high' },
      },
    }
    expect(validateGraph(sound)).toEqual([])
  })
})
