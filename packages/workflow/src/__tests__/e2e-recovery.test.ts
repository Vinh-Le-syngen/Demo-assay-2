import { describe, it, expect } from 'vitest'
import { advance, startStage, type GateContext } from '../engine'
import { validateWorkflowDefinition, type WorkflowDefinition, type Stage } from '../definition'

// e2e (recovery path) — a case halts on an unmet gate, the operator remediates, and the case then
// proceeds to terminal. The blocked→recovery traversal exercises the full lifecycle through a
// validated definition, mirroring how an app re-drives a stalled case after supplying real data.

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

describe('e2e — blocked then recovery lifecycle', () => {
  it('blocked → recovery: case halts on a missing gate, then completes after remediation', () => {
    // First run: documents missing → case halts at 'documents'.
    const blocked = runCase(def, { paymentCleared: true })
    expect(blocked.path).toEqual(['intake', 'documents'])
    expect(blocked.last).toMatchObject({ ok: false, reason: 'blocked', from: 'documents' })
    expect(blocked.last.pending?.[0]?.kind).toBe('documents')

    // Recovery: operator uploads documents → re-run reaches terminal.
    const recovered = runCase(def, { documentsComplete: true, paymentCleared: true })
    expect(recovered.last.reason).toBe('terminal')
    expect(recovered.path[recovered.path.length - 1]).toBe('completion')
  })

  it('recovery halts again at the NEXT unmet gate when remediation is partial', () => {
    expect(validateWorkflowDefinition(def)).toEqual([])
    // Documents fixed but payment still missing → case advances past documents and halts at payment.
    const partial = runCase(def, { documentsComplete: true })
    expect(partial.path).toEqual(['intake', 'documents', 'payment'])
    expect(partial.last).toMatchObject({ ok: false, reason: 'blocked', from: 'payment' })
    expect(partial.last.pending?.[0]?.kind).toBe('payment')

    // Full remediation → terminal completion.
    const done = runCase(def, { documentsComplete: true, paymentCleared: true })
    expect(done.last.reason).toBe('terminal')
    expect(done.last.from).toBe('completion')
  })
})
