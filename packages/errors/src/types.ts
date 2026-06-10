// @sys/errors types — error-code registry + alert policy (Governance + Observability).
// The code vocabulary is DATA, not hardcoded: each registry declares its own domains, so one engine
// serves both substrate registries (RT/INT/DOM/CTL/EXP) and product registries (AUTH/DOC/AML/…).
// Codes follow DOMAIN.AREA.CONDITION (uppercase, dot-separated). DOMAIN is the first segment.
import type { Severity } from '@sys/telemetry'

/** The first code segment — a substrate plane or an owning component, per the registry's vocabulary. */
export type Domain = string

/** One registered error code. `retryable` is authoritative — callers MUST NOT override it. */
export interface ErrorSpec {
  /** DOMAIN.AREA.CONDITION, e.g. 'AUTH.TOKEN.INVALID_SIGNATURE' or 'RT.DB.TIMEOUT'. */
  code: string
  /** The owning domain/plane; must equal the code's first segment. */
  domain: Domain
  retryable: boolean
  /** Operator-facing description. */
  message?: string
  /** What to do about it. */
  remediation?: string
  /** Owning component id (e.g. 'COMP-AUTH'), free-form. */
  owner?: string
  /** Severity to emit at when this occurs (telemetry vocabulary; default 'error'). */
  severity?: Severity
  /** Alert route key (resolved against an AlertPolicy / the host's notifier). */
  alert?: string
  /** Kept-for-compat code; do not emit new instances. */
  deprecated?: boolean
  /** The code that supersedes a deprecated one. */
  replacedBy?: string
}

export interface ErrorRegistry {
  schemaVersion: number
  /** Allowed domain vocabulary. When present, validateRegistry enforces it; absent ⇒ shape-only. */
  domains?: Domain[]
  codes: ErrorSpec[]
}

/** A routing rule: match by exact code, code prefix (e.g. 'INT.STRIPE'), or domain. */
export interface AlertRule {
  match: { code?: string; prefix?: string; domain?: Domain }
  route: string
  severity?: Severity
  suppress?: boolean
}

export interface AlertPolicy {
  rules: AlertRule[]
  /** Used when no rule matches. Absent ⇒ route 'none'. */
  default?: { route: string; severity?: Severity }
}

/** The resolved routing decision for an occurrence of `code`. */
export interface AlertDecision {
  code: string
  route: string
  severity: Severity
  suppress: boolean
}

/** A classifier: the first matcher whose `test` passes names the code for an unknown error. */
export interface Matcher {
  code: string
  test: (error: unknown) => boolean
}

/** Context the host supplies to turn an error occurrence into a telemetry event. */
export interface ErrorContext {
  id: string
  ts: string
  traceId?: string
  actor?: { id?: string; type?: string }
  subject?: { id?: string; type?: string }
  data?: Record<string, unknown>
}
