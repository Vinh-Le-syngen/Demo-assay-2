import { describe, it, expect } from 'vitest'
import {
  affected,
  validateGraph,
  propagationGaps,
  conceptConsumers,
  orphanConsumedConcepts,
  type DependencyGraph,
} from '../core'

// A small graph exercising structural edges, concept edges, criticality, and a cycle.
//   A --impacts--> B --impacts--> C
//   A provides concept "x"; D consumes "x"
//   C --impacts--> A  (cycle)
const graph: DependencyGraph = {
  version: 1,
  files: {
    A: { criticality: 'critical', provides_concepts: ['x'], impacts: [{ target: 'B' }] },
    B: { criticality: 'high', impacts: [{ target: 'C' }] },
    C: { criticality: 'low', impacts: [{ target: 'A' }] }, // back-edge → cycle
    D: { criticality: 'medium', consumes_concepts: ['x'] },
  },
}

describe('affected (transitive impact closure)', () => {
  it('walks structural edges transitively and excludes the seed', () => {
    const items = affected(graph, ['A'])
    const byFile = Object.fromEntries(items.map((i) => [i.file, i]))
    // A reaches B, C (structural) and D (via concept x). A itself is not reported.
    expect(Object.keys(byFile).sort()).toEqual(['B', 'C', 'D'])
    expect(byFile.A).toBeUndefined()
  })

  it('terminates on cycles', () => {
    // C → A → B → C; querying C must not loop forever. C reaches A (structural), B (A→B),
    // and D (A provides concept x, which D consumes). C itself is the seed, so excluded.
    const files = affected(graph, ['C']).map((i) => i.file).sort()
    expect(files).toEqual(['A', 'B', 'D'])
  })

  it('ranks results critical → low', () => {
    const items = affected(graph, ['D' /* nothing */, 'C'])
    const order = items.map((i) => i.criticality)
    // C reaches A (critical) and B (high) → critical first
    expect(order).toEqual(['critical', 'high'])
  })

  it('follows concept edges (provided → consumers)', () => {
    expect(conceptConsumers(graph, 'x')).toEqual(['D'])
    const item = affected(graph, ['A']).find((i) => i.file === 'D')
    expect(item?.reason).toBe('concept:x')
  })

  it('accepts a concept as a direct input', () => {
    const files = affected(graph, ['x']).map((i) => i.file)
    expect(files).toEqual(['D'])
  })

  it('honors exempt', () => {
    const files = affected(graph, ['A'], { exempt: ['D'] }).map((i) => i.file).sort()
    expect(files).toEqual(['B', 'C'])
  })

  it('returns empty for an unknown input', () => {
    expect(affected(graph, ['nope'])).toEqual([])
  })
})

describe('validateGraph (referential integrity)', () => {
  it('passes a clean graph', () => {
    expect(validateGraph(graph)).toEqual([])
  })

  it('flags dangling impact targets', () => {
    const bad: DependencyGraph = { files: { A: { impacts: [{ target: 'GHOST' }] } } }
    expect(validateGraph(bad)).toContain("[A] impact target not in graph: 'GHOST'")
  })

  it('flags self-impact, duplicates, and bad criticality', () => {
    const bad: DependencyGraph = {
      files: {
        A: {
          criticality: 'urgent' as never,
          impacts: [{ target: 'A' }, { target: 'B' }, { target: 'B' }],
        },
        B: {},
      },
    }
    const errors = validateGraph(bad)
    expect(errors).toContain('[A] self-impact edge')
    expect(errors).toContain("[A] duplicate impact target 'B'")
    expect(errors).toContain("[A] invalid criticality 'urgent'")
  })

  it('rejects a non-object files', () => {
    expect(validateGraph({ files: null as never })).toEqual(['graph.files must be an object'])
  })

  it('detects orphan consumed concepts separately', () => {
    const g: DependencyGraph = { files: { A: { consumes_concepts: ['ghost'] } } }
    expect(validateGraph(g)).toEqual([]) // structural integrity is fine
    expect(orphanConsumedConcepts(g)).toEqual(['ghost'])
  })
})

describe('propagationGaps (the propagation guard)', () => {
  it('reports a changed source whose dependents were not changed', () => {
    // Changed A but not B → gap.
    expect(propagationGaps(graph, ['A'])).toEqual([{ source: 'A', missingTargets: ['B'] }])
  })

  it('is clean when every changed source has its targets in the changeset', () => {
    // A→B, B→C, C→A: changing all three closes every edge.
    expect(propagationGaps(graph, ['A', 'B', 'C'])).toEqual([])
  })

  it('honors exempt for both source and target', () => {
    expect(propagationGaps(graph, ['A'], { exempt: ['B'] })).toEqual([])
    expect(propagationGaps(graph, ['A'], { exempt: ['A'] })).toEqual([])
  })

  it('ignores changed files with no declared impacts', () => {
    expect(propagationGaps(graph, ['D'])).toEqual([])
  })
})
