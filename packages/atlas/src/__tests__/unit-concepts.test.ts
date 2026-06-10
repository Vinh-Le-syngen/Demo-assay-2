import { describe, it, expect } from 'vitest'
import {
  conceptConsumers,
  providedConceptSet,
  orphanConsumedConcepts,
  affected,
  type DependencyGraph,
} from '../core'

// Unit (correctness): pure concept-resolution helpers and criticality defaulting. No IO, no
// external systems — each function takes a plain graph and returns plain data. Complements
// core.test.ts (which focuses on the affected/validate/propagation seams) by pinning the
// concept-layer primitives those seams are built on.

const graph: DependencyGraph = {
  version: 1,
  files: {
    src: { provides_concepts: ['pricing', 'pricing'], impacts: [] }, // duplicate provide
    a: { consumes_concepts: ['pricing'] },
    b: { consumes_concepts: ['pricing', 'taxonomy'] }, // 'taxonomy' is provided by nobody
    c: {}, // neither provides nor consumes
  },
}

describe('conceptConsumers (pure)', () => {
  it('returns every file that declares it consumes the concept', () => {
    expect(conceptConsumers(graph, 'pricing').sort()).toEqual(['a', 'b'])
  })

  it('returns empty for a concept no file consumes', () => {
    expect(conceptConsumers(graph, 'nonexistent')).toEqual([])
  })
})

describe('providedConceptSet (pure)', () => {
  it('collects the de-duplicated set of all provided concepts', () => {
    const set = providedConceptSet(graph)
    expect(set.has('pricing')).toBe(true)
    expect([...set]).toEqual(['pricing']) // duplicate 'pricing' collapses; 'taxonomy' not provided
  })
})

describe('orphanConsumedConcepts (pure)', () => {
  it('flags consumed concepts that no file provides, sorted', () => {
    expect(orphanConsumedConcepts(graph)).toEqual(['taxonomy'])
  })

  it('is empty when every consumed concept is provided', () => {
    const closed: DependencyGraph = {
      files: { p: { provides_concepts: ['k'] }, q: { consumes_concepts: ['k'] } },
    }
    expect(orphanConsumedConcepts(closed)).toEqual([])
  })
})

describe('criticality defaulting (pure)', () => {
  it("treats a node without an explicit criticality as 'medium' in affected()", () => {
    // 'src' provides 'pricing' which 'a' and 'b' consume; neither declares a criticality,
    // so both must surface as 'medium'.
    const items = affected(graph, ['src'])
    const byFile = Object.fromEntries(items.map((i) => [i.file, i.criticality]))
    expect(byFile.a).toBe('medium')
    expect(byFile.b).toBe('medium')
  })
})
