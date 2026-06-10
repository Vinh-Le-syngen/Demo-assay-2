import { describe, it, expect } from 'vitest'
import { validateWorkflowDefinition, type WorkflowDefinition, type Stage } from '../definition'

// adversarial — a hostile/malformed WorkflowDefinition is protocol misuse: a caller feeding
// the validator a document crafted to slip past structural checks (duplicate keys to shadow a
// stage, an out-of-vocabulary gate kind smuggled past the type system, a select field with no
// options that would render an empty/unsatisfiable control). The validator must catch every one
// and never throw. These are the gatekeeper's last line before a bad definition drives a case.

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

describe('adversarial — malformed definitions the validator must reject', () => {
  it('rejects duplicate stage keys, an unknown gate kind, and a custom gate missing its id', () => {
    const hostile: WorkflowDefinition = {
      serviceType: 'svc',
      country: 'AE',
      stages: [
        stage({ key: 'dup', number: 1, gates: [{ kind: 'mind_control' } as never] }),
        // second stage shadows the first key, and carries a custom gate with no id
        stage({ key: 'dup', number: 2, gates: [{ kind: 'custom' } as never] }),
      ],
      transitions: { dup: ['dup'] },
    }
    const errs = validateWorkflowDefinition(hostile)
    expect(errs.some((e) => e.includes("duplicate stage key 'dup'"))).toBe(true)
    expect(errs.some((e) => e.includes("invalid gate kind 'mind_control'"))).toBe(true)
    expect(errs.some((e) => e.includes('custom gate missing id'))).toBe(true)
    expect(errs.length).toBeGreaterThan(0)
  })
})
