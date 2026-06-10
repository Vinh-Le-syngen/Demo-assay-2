// @eng/workflow engine — the universal executor that runs any service from its WorkflowDefinition.
// PURE core: given a definition, the current stage, and a gate-evaluation context, it decides whether
// the request can advance, what's blocking it, and the next stage. The app wires it to real data
// (documents/payment/AML) + persistence + side-effects; agent + UI read the same decisions.
// Lifted from Qarar unchanged (it was already pure).

import type { WorkflowDefinition, Gate, Stage } from './definition'

/** What the engine knows about a request's readiness, supplied by the app from real data. */
export interface GateContext {
  documentsComplete?: boolean
  paymentCleared?: boolean
  amlCleared?: boolean
  custom?: Record<string, boolean>
}

export interface AdvanceResult {
  ok: boolean
  from: string
  to?: string
  candidates?: string[]
  pending?: Gate[]
  reason?: 'blocked' | 'terminal' | 'unknown_stage' | 'invalid_transition' | 'ambiguous' | 'advanced'
}

/** Whether a single gate is satisfied given the context. Pure. */
export function evaluateGate(gate: Gate, ctx: GateContext): boolean {
  switch (gate.kind) {
    case 'documents':
      return ctx.documentsComplete === true
    case 'payment':
      return ctx.paymentCleared === true
    case 'aml':
      return ctx.amlCleared === true
    case 'custom':
      return ctx.custom?.[gate.id] === true
  }
}

function stageByKey(def: WorkflowDefinition, key: string): Stage | undefined {
  return def.stages.find((s) => s.key === key)
}

/** Gates on the stage that are not yet satisfied (must all pass to advance). */
export function pendingGates(stage: Stage, ctx: GateContext): Gate[] {
  return (stage.gates ?? []).filter((g) => !evaluateGate(g, ctx))
}

/** The first stage (number 1) — where a new service request starts. */
export function startStage(def: WorkflowDefinition): Stage | undefined {
  return def.stages.find((s) => s.number === 1) ?? def.stages[0]
}

/** Allowed next stages from the current one (forward-only). */
export function allowedTransitions(def: WorkflowDefinition, fromKey: string): string[] {
  const tos = def.transitions[fromKey] ?? []
  const from = stageByKey(def, fromKey)
  return tos.filter((to) => {
    const s = stageByKey(def, to)
    return s !== undefined && (!from || s.number > from.number)
  })
}

/**
 * Decide the advance from `fromKey` given the gate context. Pure. Does not mutate or persist.
 * blocked | terminal | ambiguous | advanced.
 */
export function advance(def: WorkflowDefinition, fromKey: string, ctx: GateContext): AdvanceResult {
  const from = stageByKey(def, fromKey)
  if (!from) return { ok: false, from: fromKey, reason: 'unknown_stage' }

  const pending = pendingGates(from, ctx)
  if (pending.length > 0) return { ok: false, from: fromKey, pending, reason: 'blocked' }

  const candidates = allowedTransitions(def, fromKey)
  if (candidates.length === 0) return { ok: false, from: fromKey, reason: 'terminal' }
  if (candidates.length > 1) return { ok: false, from: fromKey, candidates, reason: 'ambiguous' }

  return { ok: true, from: fromKey, to: candidates[0], reason: 'advanced' }
}
