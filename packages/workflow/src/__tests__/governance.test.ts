import { describe, it, expect } from 'vitest'
import { advance, pendingGates, type GateContext } from '../engine'
import { type WorkflowDefinition, type Stage } from '../definition'

// governance / authz-policy & process — the gate-wiring policy is the case-integrity control:
// a stage MUST NOT advance while any of its gates is unsatisfied, regardless of how many
// transitions are wired. Conversely, every gate satisfied is the ONLY condition that releases
// the stage. These tests pin the policy that gates are blocking AND-conjunctions, so wiring a
// gate onto a stage is a hard authorization barrier on case progression.

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

// A stage guarded by THREE gates wired onto it; one open transition forward.
const def: WorkflowDefinition = {
  serviceType: 'svc',
  country: 'AE',
  stages: [
    stage({ key: 'guarded', number: 1, gates: [{ kind: 'documents' }, { kind: 'payment' }, { kind: 'aml' }] }),
    stage({ key: 'cleared', number: 2 }),
  ],
  transitions: { guarded: ['cleared'] },
}

describe('governance — gates are blocking AND-conjunctions on advance', () => {
  it('policy: any single unsatisfied gate blocks advance even with a valid forward transition', () => {
    // all but one cleared → still blocked, and the blocking gate is reported in pending
    const missingAml: GateContext = { documentsComplete: true, paymentCleared: true }
    const r = advance(def, 'guarded', missingAml)
    expect(r).toMatchObject({ ok: false, reason: 'blocked' })
    expect(r.to).toBeUndefined()
    expect(pendingGates(def.stages[0]!, missingAml).map((g) => g.kind)).toEqual(['aml'])

    // zero gates cleared → all three are pending
    expect(advance(def, 'guarded', {})).toMatchObject({ ok: false, reason: 'blocked' })
    expect(pendingGates(def.stages[0]!, {})).toHaveLength(3)
  })
})
