import { describe, it, expect } from 'vitest'
import { validateGraph, type DependencyGraph } from '../core'

// Negative (resilience): bad/invalid inputs must fail correctly — validateGraph must REPORT
// every integrity violation rather than throw. (The "unsupported input" axis — queries over
// inputs absent from the graph — lives in the sibling negative-unsupported.test.ts.)

describe('input-validation: validateGraph reports structural violations', () => {
  it('reports a null files container as a single fatal error', () => {
    expect(validateGraph({ files: undefined as never })).toEqual(['graph.files must be an object'])
  })

  it('reports a null node without aborting the whole scan', () => {
    const bad: DependencyGraph = {
      files: {
        nul: null as never,
        ok: { impacts: [{ target: 'GHOST' }] }, // a later node must still be checked
      },
    }
    const errors = validateGraph(bad)
    expect(errors).toContain('[nul] node is null')
    expect(errors).toContain("[ok] impact target not in graph: 'GHOST'")
  })

  it('reports an edge whose target is missing/empty', () => {
    const bad: DependencyGraph = {
      files: { a: { impacts: [{ target: '' as never }, { target: undefined as never }] } },
    }
    const errors = validateGraph(bad)
    expect(errors.filter((e) => e === '[a] impact edge missing target')).toHaveLength(2)
  })

  it('accumulates multiple distinct errors instead of failing fast', () => {
    const bad: DependencyGraph = {
      files: {
        a: {
          criticality: 'severe' as never,
          impacts: [{ target: 'a' }, { target: 'b' }, { target: 'b' }],
        },
        b: {},
      },
    }
    const errors = validateGraph(bad)
    expect(errors).toEqual(
      expect.arrayContaining([
        "[a] invalid criticality 'severe'",
        '[a] self-impact edge',
        "[a] duplicate impact target 'b'",
      ]),
    )
  })
})
