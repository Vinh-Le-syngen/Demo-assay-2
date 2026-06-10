import { describe, it, expect } from 'vitest'
import { advance, pendingGates, startStage, allowedTransitions, evaluateGate, type GateContext } from '../engine'
import { validateWorkflowDefinition, type WorkflowDefinition, type Stage } from '../definition'

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
    stage({ key: 'intake', number: 1 }),
    stage({ key: 'documents', number: 2, gates: [{ kind: 'documents' }] }),
    stage({ key: 'done', number: 3 }),
  ],
  transitions: { intake: ['documents'], documents: ['done'] },
}

describe('engine', () => {
  it('startStage = number 1', () => {
    expect(startStage(def)?.key).toBe('intake')
  })
  it('advances when gates clear and one transition', () => {
    expect(advance(def, 'intake', {})).toMatchObject({ ok: true, to: 'documents', reason: 'advanced' })
  })
  it('blocks on an unsatisfied gate', () => {
    const r = advance(def, 'documents', {})
    expect(r).toMatchObject({ ok: false, reason: 'blocked' })
    expect(r.pending).toHaveLength(1)
  })
  it('advances past a gate once satisfied', () => {
    const ctx: GateContext = { documentsComplete: true }
    expect(advance(def, 'documents', ctx)).toMatchObject({ ok: true, to: 'done' })
  })
  it('terminal at the last stage', () => {
    expect(advance(def, 'done', {})).toMatchObject({ ok: false, reason: 'terminal' })
  })
  it('unknown stage', () => {
    expect(advance(def, 'nope', {})).toMatchObject({ ok: false, reason: 'unknown_stage' })
  })
  it('ambiguous when >1 forward transition', () => {
    const d2: WorkflowDefinition = { ...def, transitions: { intake: ['documents', 'done'], documents: ['done'] } }
    expect(advance(d2, 'intake', {})).toMatchObject({ ok: false, reason: 'ambiguous', candidates: ['documents', 'done'] })
  })
  it('evaluateGate + pendingGates + allowedTransitions', () => {
    expect(evaluateGate({ kind: 'aml' }, { amlCleared: true })).toBe(true)
    expect(pendingGates(def.stages[1]!, {})).toHaveLength(1)
    expect(allowedTransitions(def, 'intake')).toEqual(['documents'])
  })
})

describe('validateWorkflowDefinition (injected seams)', () => {
  it('valid definition → no errors', () => {
    expect(validateWorkflowDefinition(def)).toEqual([])
  })
  it('flags unknown serviceType only when knownServiceTypes injected', () => {
    expect(validateWorkflowDefinition(def, {})).toEqual([])
    expect(validateWorkflowDefinition(def, { knownServiceTypes: ['visa'] })[0]).toContain('unknown serviceType')
  })
  it('flags non-contiguous stage numbers and bad country', () => {
    const bad: WorkflowDefinition = { ...def, country: 'uae', stages: [stage({ key: 'a', number: 1 }), stage({ key: 'b', number: 3 })], transitions: {} }
    const errs = validateWorkflowDefinition(bad)
    expect(errs.some((e) => e.includes('ISO-3166'))).toBe(true)
    expect(errs.some((e) => e.includes('contiguous'))).toBe(true)
  })
  it('flags an invalid actor against injected roles', () => {
    const bad: WorkflowDefinition = { ...def, stages: [stage({ key: 'intake', number: 1, actor: 'wizard' })], transitions: {} }
    expect(validateWorkflowDefinition(bad, { roles: ['agent', 'client'] })[0]).toContain("invalid actor 'wizard'")
  })
})
