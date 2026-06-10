import { describe, it, expect } from 'vitest'
import { propagationGaps, type DependencyGraph } from '../core'

// Governance (compliance): atlas IS a guard — propagationGaps renders the propagation-guard
// VERDICT that CI enforces ("you changed a source but not the dependents it can break"). These
// tests pin the policy decision itself: the guard must FAIL-CLOSED on an uncovered declared
// coupling, PASS only when every declared coupling in the changeset is covered, and honour the
// exempt escape hatch deliberately (an exemption is an explicit policy waiver, not a bug). The
// structural-precondition policy (validateGraph must pass first) lives in the sibling
// governance-precondition.test.ts.

// A graph modelling a declared coupling: a pricing-config change is declared to impact the
// invoice renderer and the tax engine. The guard's job is to enforce that coupling.
const graph: DependencyGraph = {
  files: {
    'config/pricing.ts': {
      criticality: 'critical',
      impacts: [{ target: 'render/invoice.ts' }, { target: 'engine/tax.ts' }],
    },
    'render/invoice.ts': { criticality: 'high' },
    'engine/tax.ts': { criticality: 'high' },
    'docs/readme.md': { criticality: 'low' }, // unrelated, no couplings
  },
}

describe('propagation-guard policy: declared couplings must be covered', () => {
  it('fails closed: changing only the source surfaces every uncovered dependent', () => {
    const verdict = propagationGaps(graph, ['config/pricing.ts'])
    expect(verdict).toEqual([
      { source: 'config/pricing.ts', missingTargets: ['engine/tax.ts', 'render/invoice.ts'] },
    ])
  })

  it('partial coverage is still a violation: one uncovered dependent fails the guard', () => {
    const verdict = propagationGaps(graph, ['config/pricing.ts', 'render/invoice.ts'])
    expect(verdict).toEqual([
      { source: 'config/pricing.ts', missingTargets: ['engine/tax.ts'] },
    ])
  })

  it('passes only when the changeset covers every declared coupling', () => {
    const verdict = propagationGaps(graph, [
      'config/pricing.ts',
      'render/invoice.ts',
      'engine/tax.ts',
    ])
    expect(verdict).toEqual([])
  })

  it('an exemption is an explicit, deliberate policy waiver of a coupling', () => {
    // Waiving the tax-engine edge clears the gap for that target only; an un-waived missing
    // edge would still fail. Here both unmet edges are waived → clean.
    const verdict = propagationGaps(graph, ['config/pricing.ts'], {
      exempt: ['render/invoice.ts', 'engine/tax.ts'],
    })
    expect(verdict).toEqual([])
  })

  it('a change with no declared couplings never trips the guard', () => {
    expect(propagationGaps(graph, ['docs/readme.md'])).toEqual([])
  })
})
