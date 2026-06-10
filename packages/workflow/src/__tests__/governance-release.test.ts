import { describe, it, expect } from 'vitest'
import { advance, pendingGates, type GateContext } from '../engine'
import { type WorkflowDefinition, type Stage } from '../definition'

// governance / authz-policy — the release side of the gate-wiring policy: a guarded stage is
// released ONLY when EVERY wired gate is satisfied. This pins the AND-conjunction policy from the
// release direction — clearing all gates is the sole condition that authorizes case progression,
// and clearing them in any order converges on the same released decision.

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

describe('governance — advance is released ONLY when every wired gate is satisfied', () => {
  it('policy: all gates satisfied is the sole condition that releases the stage', () => {
    const allClear: GateContext = { documentsComplete: true, paymentCleared: true, amlCleared: true }
    expect(pendingGates(def.stages[0]!, allClear)).toEqual([])
    expect(advance(def, 'guarded', allClear)).toMatchObject({ ok: true, to: 'cleared', reason: 'advanced' })
  })

  it('policy: clearing gates in any order converges on the same released decision', () => {
    // Clear them one at a time in a non-canonical order; release happens only at full satisfaction.
    const step1: GateContext = { amlCleared: true }
    expect(advance(def, 'guarded', step1)).toMatchObject({ ok: false, reason: 'blocked' })
    expect(pendingGates(def.stages[0]!, step1).map((g) => g.kind).sort()).toEqual(['documents', 'payment'])

    const step2: GateContext = { amlCleared: true, paymentCleared: true }
    expect(advance(def, 'guarded', step2)).toMatchObject({ ok: false, reason: 'blocked' })
    expect(pendingGates(def.stages[0]!, step2).map((g) => g.kind)).toEqual(['documents'])

    const step3: GateContext = { amlCleared: true, paymentCleared: true, documentsComplete: true }
    expect(advance(def, 'guarded', step3)).toMatchObject({ ok: true, to: 'cleared', reason: 'advanced' })
  })
})
