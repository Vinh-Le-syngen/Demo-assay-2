import { describe, it, expect } from 'vitest'
import { advance } from '../engine'
import { validateWorkflowDefinition, type WorkflowDefinition, type Stage } from '../definition'

// negative — input-validation & unsupported inputs. The engine must reject nonsense without
// throwing: advancing from an unknown stage, and a definition whose transitions reference
// undeclared stages / whose presentation is malformed must surface as structured problems.

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

const base: WorkflowDefinition = {
  serviceType: 'svc',
  country: 'AE',
  stages: [stage({ key: 'a', number: 1 }), stage({ key: 'b', number: 2 })],
  transitions: { a: ['b'] },
}

describe('negative — invalid inputs are rejected, never thrown', () => {
  it('unsupported: advance from a stage that does not exist → unknown_stage', () => {
    const r = advance(base, 'does-not-exist', {})
    expect(r).toMatchObject({ ok: false, reason: 'unknown_stage', from: 'does-not-exist' })
    expect(r.to).toBeUndefined()
  })

  it('input-validation: transitions to/from undeclared stages are flagged', () => {
    const bad: WorkflowDefinition = {
      ...base,
      transitions: { a: ['z'], ghost: ['b'] },
    }
    const errs = validateWorkflowDefinition(bad)
    expect(errs.some((e) => e.includes("-> unknown stage 'z'"))).toBe(true)
    expect(errs.some((e) => e.includes("transition from unknown stage 'ghost'"))).toBe(true)
  })
})
