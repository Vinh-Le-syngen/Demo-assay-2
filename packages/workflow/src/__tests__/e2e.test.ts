import { describe, it, expect } from 'vitest'
import { advance, startStage, type GateContext } from '../engine'
import { validateWorkflowDefinition, type WorkflowDefinition, type Stage } from '../definition'

// e2e (happy path) — full case lifecycle through a validated definition. A case starts at the
// queue (startStage), is advanced gate-by-gate by an app-supplied context, and reaches a terminal
// stage via a complete traversal to completion. The blocked→recovery path lives in e2e-recovery.

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
  serviceType: 'golden_visa',
  country: 'AE',
  stages: [
    stage({ key: 'intake', number: 1, actor: 'client' }),
    stage({ key: 'documents', number: 2, gates: [{ kind: 'documents' }] }),
    stage({ key: 'payment', number: 3, gates: [{ kind: 'payment' }] }),
    stage({ key: 'submission', number: 4 }),
    stage({ key: 'completion', number: 5, actor: 'admin' }),
  ],
  transitions: { intake: ['documents'], documents: ['payment'], payment: ['submission'], submission: ['completion'] },
}

// drive a case to terminal; returns the visited path and the final result.
function runCase(d: WorkflowDefinition, ctx: GateContext) {
  let key = startStage(d)!.key
  const path: string[] = [key]
  let last = advance(d, key, ctx)
  for (let i = 0; i < 20 && last.reason !== 'terminal'; i++) {
    if (!last.ok) return { path, last }
    key = last.to!
    path.push(key)
    last = advance(d, key, ctx)
  }
  return { path, last }
}

describe('e2e — full case lifecycle', () => {
  it('happy: queue → advance through every gate → terminal completion', () => {
    expect(validateWorkflowDefinition(def)).toEqual([])
    const { path, last } = runCase(def, { documentsComplete: true, paymentCleared: true })
    expect(path).toEqual(['intake', 'documents', 'payment', 'submission', 'completion'])
    expect(last.reason).toBe('terminal')
    expect(last.from).toBe('completion')
  })
})
