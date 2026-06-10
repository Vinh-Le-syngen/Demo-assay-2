import { describe, it, expect } from 'vitest'
import { affected, validateGraph, propagationGaps, type DependencyGraph } from '../core'

// Adversarial (resilience): the graph is project-supplied data that may be hostile, machine-
// generated, or corrupted. This file pins the PROTOCOL-MISUSE axis — malformed edge/node objects
// must be handled, not trusted — split out of adversarial.test.ts, which keeps the resource-abuse
// (pathological-shape) axis.

describe('protocol-misuse: malformed node/edge objects are handled, not trusted', () => {
  it('affected() ignores edges with null/garbage targets instead of crashing', () => {
    const graph: DependencyGraph = {
      files: {
        a: {
          impacts: [
            null as never,
            { target: null as never },
            { target: 'b' },
            {} as never,
          ],
        },
        b: {},
      },
    }
    // Only the well-formed edge to 'b' is honoured; malformed edges are dropped silently.
    expect(affected(graph, ['a']).map((i) => i.file)).toEqual(['b'])
  })

  it('propagationGaps() tolerates a node whose impacts array is malformed', () => {
    const graph: DependencyGraph = {
      files: {
        a: { impacts: [{ target: undefined as never }, { target: 'b' }] },
        b: {},
      },
    }
    // The undefined target is filtered; the real edge to 'b' is the only candidate gap.
    expect(propagationGaps(graph, ['a'])).toEqual([{ source: 'a', missingTargets: ['b'] }])
  })

  it('validateGraph does not throw on nodes with unexpected extra/garbage fields', () => {
    const graph: DependencyGraph = {
      files: {
        a: { kind: 'weird', extra: { nested: true } } as never,
        b: { impacts: [{ target: 'a', reasons: ['x'], confirmed: 'not-a-date' }] },
      },
    }
    // Advisory fields (reasons/confirmed) and unknown fields are not validated → no errors.
    expect(validateGraph(graph)).toEqual([])
  })
})
