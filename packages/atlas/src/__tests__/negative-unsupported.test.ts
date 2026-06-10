import { describe, it, expect } from 'vitest'
import {
  affected,
  propagationGaps,
  conceptConsumers,
  type DependencyGraph,
} from '../core'

// Negative (resilience): query functions must degrade to empty results on inputs that name
// nothing in the graph (unsupported), never crashing. Split out of negative.test.ts so the
// "unsupported input" axis is its own registered file alongside the structural-violation axis.

describe('unsupported: queries over inputs absent from the graph', () => {
  const graph: DependencyGraph = {
    files: { a: { impacts: [{ target: 'b' }] }, b: {} },
  }

  it('affected() returns empty for a file/concept not present, without throwing', () => {
    expect(affected(graph, ['does-not-exist'])).toEqual([])
    expect(affected(graph, [])).toEqual([])
  })

  it('conceptConsumers() returns empty for an unknown concept', () => {
    expect(conceptConsumers(graph, 'unknown')).toEqual([])
  })

  it('propagationGaps() ignores changed files that are not graph nodes', () => {
    // 'phantom' has no node (so no declared impacts) — it must not produce a gap or throw.
    expect(propagationGaps(graph, ['phantom'])).toEqual([])
  })
})
