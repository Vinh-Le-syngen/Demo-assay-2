import { describe, it, expect } from 'vitest'
import { evaluateGate, startStage, allowedTransitions, pendingGates } from '../engine'
import { type WorkflowDefinition, type Stage } from '../definition'

// unit / boundary — exercise the pure helpers in isolation at their edges:
// custom-gate evaluation, startStage fallback when no stage is numbered 1, and the
// forward-only filter that allowedTransitions applies to declared transitions.

function stage(over: Partial<Stage> & Pick<Stage, 'key' | 'number'>): Stage {
  return {
    labelKey: `stage.${over.key}`,
    actor: 'agent',
    requiredDocTypes: [],
    gates: [],
    sideEffects: [],
    presentation: { titleKey: `t.${over.key}`, fields: [], documentChecklist: [], primaryActionKey: 'action.next' },
    ...over,
  }
}

describe('engine helpers — boundary', () => {
  it('evaluateGate: custom gate keys into ctx.custom by id', () => {
    expect(evaluateGate({ kind: 'custom', id: 'kyc' }, { custom: { kyc: true } })).toBe(true)
    expect(evaluateGate({ kind: 'custom', id: 'kyc' }, { custom: { kyc: false } })).toBe(false)
    // absent custom map → unsatisfied, never throws
    expect(evaluateGate({ kind: 'custom', id: 'kyc' }, {})).toBe(false)
  })

  it('evaluateGate: built-in gates require strict true (undefined is unsatisfied)', () => {
    expect(evaluateGate({ kind: 'payment' }, {})).toBe(false)
    expect(evaluateGate({ kind: 'payment' }, { paymentCleared: true })).toBe(true)
  })

  it('startStage: falls back to the first stage when none is numbered 1', () => {
    const def: WorkflowDefinition = {
      serviceType: 'svc',
      country: 'AE',
      stages: [stage({ key: 'b', number: 2 }), stage({ key: 'c', number: 3 })],
      transitions: {},
    }
    expect(startStage(def)?.key).toBe('b')
  })

  it('allowedTransitions: drops backward and unknown targets (forward-only)', () => {
    const def: WorkflowDefinition = {
      serviceType: 'svc',
      country: 'AE',
      stages: [stage({ key: 'a', number: 1 }), stage({ key: 'b', number: 2 })],
      // declares a backward edge (b->a) and an unknown target (b->ghost)
      transitions: { b: ['a', 'ghost'] },
    }
    expect(allowedTransitions(def, 'b')).toEqual([])
    // pendingGates on a gateless stage is empty
    expect(pendingGates(def.stages[0]!, {})).toEqual([])
  })
})
