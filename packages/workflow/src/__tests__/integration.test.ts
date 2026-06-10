import { describe, it, expect } from 'vitest'
import { advance, startStage, type GateContext } from '../engine'
import { type WorkflowDefinition, type Stage } from '../definition'

// integration / intra-system — drive advance() across multiple real stages of a single
// WorkflowDefinition, feeding the gate context the way an app would, and assert the engine
// composes its pure helpers (gate eval + forward-only transition selection) coherently
// from stage to stage. No mocks; the definition + context ARE the integration surface.

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

// A realistic three-gate service: documents → payment → aml across five linear stages.
const def: WorkflowDefinition = {
  serviceType: 'company_formation',
  country: 'AE',
  stages: [
    stage({ key: 'intake', number: 1, actor: 'client' }),
    stage({ key: 'documents', number: 2, gates: [{ kind: 'documents' }] }),
    stage({ key: 'payment', number: 3, gates: [{ kind: 'payment' }] }),
    stage({ key: 'screening', number: 4, gates: [{ kind: 'aml' }] }),
    stage({ key: 'done', number: 5, actor: 'admin' }),
  ],
  transitions: { intake: ['documents'], documents: ['payment'], payment: ['screening'], screening: ['done'] },
}

describe('integration — advancing across stages of one definition', () => {
  it('walks intake → done as each gate clears in turn', () => {
    const ctx: GateContext = { documentsComplete: true, paymentCleared: true, amlCleared: true }
    let key = startStage(def)!.key
    const path: string[] = [key]
    // advance until terminal
    for (let i = 0; i < 10; i++) {
      const r = advance(def, key, ctx)
      if (r.reason === 'terminal') break
      expect(r.ok).toBe(true)
      key = r.to!
      path.push(key)
    }
    expect(path).toEqual(['intake', 'documents', 'payment', 'screening', 'done'])
  })
})
