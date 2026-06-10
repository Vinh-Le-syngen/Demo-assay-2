import { describe, it, expect } from 'vitest'
import { advance, type GateContext } from '../engine'
import { type WorkflowDefinition, type Stage } from '../definition'

// integration / intra-system — second slice of the cross-stage integration surface: a case stalls
// at the first stage whose gate is unmet, and resumes from that SAME stage once the app supplies the
// missing context. No mocks; the definition + context ARE the integration surface.

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

describe('integration — stalling then resuming on updated context', () => {
  it('stalls at the first stage whose gate is unmet, then resumes when context updates', () => {
    // documents cleared but payment not → stalls at 'payment'
    const partial: GateContext = { documentsComplete: true }
    expect(advance(def, 'intake', partial)).toMatchObject({ ok: true, to: 'documents' })
    expect(advance(def, 'documents', partial)).toMatchObject({ ok: true, to: 'payment' })
    const stalled = advance(def, 'payment', partial)
    expect(stalled).toMatchObject({ ok: false, reason: 'blocked' })
    expect(stalled.pending?.[0]?.kind).toBe('payment')

    // app supplies cleared payment → same stage now advances
    const updated: GateContext = { ...partial, paymentCleared: true }
    expect(advance(def, 'payment', updated)).toMatchObject({ ok: true, to: 'screening' })
  })

  it('a downstream gate (aml) holds the case at screening until cleared, then releases to done', () => {
    // everything but aml cleared → reaches 'screening' and stalls there
    const noAml: GateContext = { documentsComplete: true, paymentCleared: true }
    expect(advance(def, 'payment', noAml)).toMatchObject({ ok: true, to: 'screening' })
    const heldAtScreening = advance(def, 'screening', noAml)
    expect(heldAtScreening).toMatchObject({ ok: false, reason: 'blocked' })
    expect(heldAtScreening.pending?.[0]?.kind).toBe('aml')

    // aml cleared → screening releases to the terminal stage
    const cleared: GateContext = { ...noAml, amlCleared: true }
    expect(advance(def, 'screening', cleared)).toMatchObject({ ok: true, to: 'done', reason: 'advanced' })
  })
})
