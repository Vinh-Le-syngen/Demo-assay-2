// @eng/workflow — the WorkflowDefinition contract: the single declarative document that drives the
// engine, the UI renderer, and the agent tool surface. Extracted from Qarar (ADR-0002/0007) as a
// REUSABLE engine. App specifics (known service types, role vocabulary) are INJECTED seams — the
// package imports nothing from any app. Pure (no runtime deps).

/** Role is generic at the engine level; a venture injects its vocabulary to validate membership. */
export type Role = string

/** A common default role vocabulary; ventures may pass their own to the validator. */
export const DEFAULT_ROLES: readonly Role[] = ['client', 'agent', 'admin', 'partner', 'system']

export type Gate =
  | { kind: 'documents' }
  | { kind: 'payment' }
  | { kind: 'aml' }
  | { kind: 'custom'; id: string }
export const GATE_KINDS: readonly string[] = ['documents', 'payment', 'aml', 'custom']

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'document' | 'currency' | 'boolean'
export const FIELD_TYPES: readonly FieldType[] = ['text', 'number', 'date', 'select', 'document', 'currency', 'boolean']

export const VALIDATION_RULES: readonly string[] = ['expiry_check', 'name_match', 'date_range_6m', 'notarised']

export const STAGE_KINDS: readonly string[] = ['intake', 'documents', 'screening', 'payment', 'submission', 'review', 'completion']

export interface FieldSpec {
  key: string
  labelKey: string // i18n KEY, never literal copy
  type: FieldType
  required: boolean
  options?: { valueKey: string }[]
  validation?: string[]
  visibleTo: Role[]
}

export interface StagePresentation {
  titleKey: string
  fields: FieldSpec[]
  documentChecklist: string[]
  primaryActionKey: string
}

export interface Stage {
  key: string
  number: number
  labelKey: string
  actor: Role
  requiredDocTypes: string[]
  gates: Gate[]
  sideEffects: string[]
  presentation: StagePresentation
}

export interface WorkflowDefinition {
  serviceType: string
  country: string // ISO-3166-1 alpha-2
  stages: Stage[]
  transitions: Record<string, string[]>
}

/** Injected specifics — keep the validator pure and app-agnostic. */
export type ValidateOptions = {
  /** If provided, serviceType must be a member. Omit to skip the service-vocabulary check. */
  knownServiceTypes?: readonly string[]
  /** Role vocabulary to validate actor/visibleTo against. Defaults to DEFAULT_ROLES. */
  roles?: readonly Role[]
}

/**
 * Validates a WorkflowDefinition: structural integrity, presentation consistency, and vocabulary
 * membership. Returns a list of problems; empty = valid. Pure — no app imports. The caller injects
 * its known service types + role vocabulary.
 */
export function validateWorkflowDefinition(def: WorkflowDefinition, opts: ValidateOptions = {}): string[] {
  const roles = opts.roles ?? DEFAULT_ROLES
  const errors: string[] = []
  const tag = def?.serviceType || '?'
  const p = (m: string) => errors.push(`[${tag}] ${m}`)

  if (!def?.serviceType) p('serviceType is required')
  else if (opts.knownServiceTypes && !opts.knownServiceTypes.includes(def.serviceType)) p(`unknown serviceType '${def.serviceType}'`)

  if (!def?.country || !/^[A-Z]{2}$/.test(def.country)) p(`country must be an ISO-3166 alpha-2 code, got '${def?.country}'`)

  const stages = def?.stages ?? []
  if (stages.length === 0) p('must have at least one stage')

  const keys = new Set<string>()
  const numbers: number[] = []
  for (const s of stages) {
    if (keys.has(s.key)) p(`duplicate stage key '${s.key}'`)
    keys.add(s.key)
    numbers.push(s.number)
    if (!roles.includes(s.actor)) p(`stage '${s.key}' invalid actor '${s.actor}'`)
    if (!s.labelKey) p(`stage '${s.key}' missing labelKey (i18n key)`)

    for (const g of s.gates ?? []) {
      if (!GATE_KINDS.includes(g.kind)) p(`stage '${s.key}' invalid gate kind '${(g as { kind: string }).kind}'`)
      if (g.kind === 'custom' && !(g as { id?: string }).id) p(`stage '${s.key}' custom gate missing id`)
    }

    const pres = s.presentation
    if (!pres) {
      p(`stage '${s.key}' missing presentation (UI renders from it)`)
      continue
    }
    if (!pres.titleKey) p(`stage '${s.key}' presentation missing titleKey`)
    if (!pres.primaryActionKey) p(`stage '${s.key}' presentation missing primaryActionKey`)
    const fkeys = new Set<string>()
    for (const f of pres.fields ?? []) {
      if (fkeys.has(f.key)) p(`stage '${s.key}' duplicate field key '${f.key}'`)
      fkeys.add(f.key)
      if (!f.labelKey) p(`stage '${s.key}' field '${f.key}' missing labelKey (i18n key)`)
      if (!FIELD_TYPES.includes(f.type)) p(`stage '${s.key}' field '${f.key}' invalid type '${f.type}'`)
      if (f.type === 'select' && !(f.options && f.options.length)) p(`stage '${s.key}' select field '${f.key}' needs options`)
      if (!(f.visibleTo && f.visibleTo.length)) p(`stage '${s.key}' field '${f.key}' must be visible to ≥1 role`)
      for (const r of f.visibleTo ?? []) if (!roles.includes(r)) p(`stage '${s.key}' field '${f.key}' invalid visibleTo role '${r}'`)
      for (const v of f.validation ?? []) if (!VALIDATION_RULES.includes(v)) p(`stage '${s.key}' field '${f.key}' unknown validation rule '${v}'`)
    }
    for (const d of pres.documentChecklist ?? []) {
      if (!(s.requiredDocTypes ?? []).includes(d)) p(`stage '${s.key}' documentChecklist '${d}' not in requiredDocTypes`)
    }
  }

  const sorted = [...numbers].sort((a, b) => a - b)
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i + 1) {
      p(`stage numbers must be contiguous 1..${sorted.length}; got [${numbers.join(',')}]`)
      break
    }
  }

  for (const [from, tos] of Object.entries(def?.transitions ?? {})) {
    if (!keys.has(from)) p(`transition from unknown stage '${from}'`)
    for (const to of tos ?? []) if (!keys.has(to)) p(`transition '${from}' -> unknown stage '${to}'`)
  }

  return errors
}
