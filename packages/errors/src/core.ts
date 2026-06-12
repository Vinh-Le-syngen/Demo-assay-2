// @sys/errors core — pure functions over a consumer-supplied registry + alert policy.
// No I/O, no side effects. Error occurrences become @sys/telemetry events (domain 'error'); the
// host owns emission + alert delivery. `retryable` is authoritative; nothing here lets a caller flip it.
// The domain vocabulary is data: a registry may declare `domains` to be lint-enforced, else only the
// DOMAIN.AREA.CONDITION shape is checked.
import { z } from 'zod'
import type { Severity, TelemetryEvent } from '@sys/telemetry'
import type {
  AlertDecision,
  AlertPolicy,
  Domain,
  ErrorContext,
  ErrorRegistry,
  ErrorSpec,
  Matcher,
} from './types'

// DOMAIN.AREA.CONDITION — uppercase alnum segments; CONDITION may contain underscores.
const CODE_RE = /^[A-Z][A-Z0-9]*\.[A-Z0-9]+\.[A-Z0-9_]+$/

export const errorSpecSchema = z.object({
  code: z.string(),
  domain: z.string(),
  retryable: z.boolean(),
  message: z.string().optional(),
  remediation: z.string().optional(),
  owner: z.string().optional(),
  severity: z.string().optional(),
  alert: z.string().optional(),
  deprecated: z.boolean().optional(),
  replacedBy: z.string().optional(),
})

export const errorRegistrySchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  domains: z.array(z.string()).optional(),
  codes: z.array(errorSpecSchema),
})

/** Validates a registry at composition time. Throws (ZodError) on invalid input. */
export function defineRegistry(registry: ErrorRegistry): ErrorRegistry {
  return errorRegistrySchema.parse(registry) as ErrorRegistry
}

/** Find a spec by exact code. */
export function lookup(registry: ErrorRegistry, code: string): ErrorSpec | undefined {
  return registry.codes.find((c) => c.code === code)
}

/** Authoritative retryability. Unknown code ⇒ false (fail closed: do not retry the unknown). */
export function isRetryable(registry: ErrorRegistry, code: string): boolean {
  return lookup(registry, code)?.retryable ?? false
}

/** The DOMAIN (first) segment of a code, or undefined if the code is malformed. */
export function domainOf(code: string): Domain | undefined {
  if (!CODE_RE.test(code)) return undefined
  return code.split('.')[0]
}

/**
 * Map an unknown thrown value to a registered code. First matcher whose `test` returns true wins;
 * a throwing matcher is treated as no-match. Returns `fallback` if nothing matches.
 */
export function classify(error: unknown, matchers: Matcher[], fallback: string): string {
  for (const m of matchers) {
    try {
      if (m.test(error)) return m.code
    } catch {
      // a matcher that explodes is just a non-match
    }
  }
  return fallback
}

/**
 * Lint a registry. Returns human-readable issues (empty ⇒ clean). Catches the drift that breaks
 * an error contract: malformed codes, domain not in the declared vocabulary, prefix/domain mismatch,
 * duplicates, and deprecations with no/non-existent successor.
 */
export function validateRegistry(registry: ErrorRegistry): string[] {
  const issues: string[] = []
  const seen = new Set<string>()
  const known = new Set(registry.codes.map((c) => c.code))
  const vocab = registry.domains !== undefined ? new Set(registry.domains) : undefined

  for (const spec of registry.codes) {
    const { code } = spec
    const prefix = domainOf(code)
    if (prefix === undefined) {
      issues.push(`malformed code '${code}' (expected DOMAIN.AREA.CONDITION)`)
    } else if (prefix !== spec.domain) {
      issues.push(`domain mismatch on '${code}': prefix '${prefix}' vs declared '${spec.domain}'`)
    }
    if (vocab !== undefined && !vocab.has(spec.domain)) {
      issues.push(`domain '${spec.domain}' on '${code}' is not in the declared vocabulary`)
    }
    if (seen.has(code)) issues.push(`duplicate code '${code}'`)
    seen.add(code)
    if (spec.deprecated && spec.replacedBy === undefined) {
      issues.push(`deprecated code '${code}' has no replacedBy`)
    }
    if (spec.replacedBy !== undefined && !known.has(spec.replacedBy)) {
      issues.push(`'${code}' replacedBy '${spec.replacedBy}' which is not in the registry`)
    }
  }
  return issues
}

function matches(spec: ErrorSpec, rule: AlertPolicy['rules'][number]): boolean {
  const m = rule.match
  if (m.code !== undefined) return spec.code === m.code
  if (m.prefix !== undefined) return spec.code === m.prefix || spec.code.startsWith(m.prefix + '.')
  if (m.domain !== undefined) return spec.domain === m.domain
  return false
}

/**
 * Resolve the routing decision for an occurrence of `spec`. Rules are evaluated in order; the first
 * match wins. No match ⇒ the policy default, else route 'none'. Severity falls back rule → spec → 'error'.
 */
export function alertPlan(spec: ErrorSpec, policy: AlertPolicy): AlertDecision {
  const specSeverity: Severity = spec.severity ?? 'error'
  for (const rule of policy.rules) {
    if (matches(spec, rule)) {
      return {
        code: spec.code,
        route: rule.route,
        severity: rule.severity ?? specSeverity,
        suppress: rule.suppress ?? false,
      }
    }
  }
  if (policy.default !== undefined) {
    return {
      code: spec.code,
      route: policy.default.route,
      severity: policy.default.severity ?? specSeverity,
      suppress: false,
    }
  }
  return { code: spec.code, route: 'none', severity: specSeverity, suppress: true }
}

/**
 * Turn an error occurrence into a telemetry event (telemetry domain 'error', type = code). Pure: the
 * host supplies id/ts/correlation. The error's own domain + retryable + remediation are folded into
 * `data` so a single event carries the full error contract. An unknown code still emits, marked
 * `registered: false`.
 */
export function toTelemetryEvent(
  registry: ErrorRegistry,
  code: string,
  ctx: ErrorContext,
): TelemetryEvent {
  const spec = lookup(registry, code)
  const severity: Severity = spec?.severity ?? 'error'
  const data: Record<string, unknown> = {
    ...(ctx.data ?? {}),
    registered: spec !== undefined,
    retryable: spec?.retryable ?? false,
  }
  const domain = spec?.domain ?? domainOf(code)
  if (domain !== undefined) data.domain = domain
  if (spec?.owner !== undefined) data.owner = spec.owner
  if (spec?.remediation !== undefined) data.remediation = spec.remediation
  if (spec?.deprecated) {
    data.deprecated = true
    if (spec.replacedBy !== undefined) data.replacedBy = spec.replacedBy
  }
  const event: TelemetryEvent = {
    id: ctx.id,
    ts: ctx.ts,
    domain: 'error',
    type: code,
    severity,
    data,
  }
  if (ctx.traceId !== undefined) event.traceId = ctx.traceId
  if (ctx.actor !== undefined) event.actor = ctx.actor
  if (ctx.subject !== undefined) event.subject = ctx.subject
  return event
}
