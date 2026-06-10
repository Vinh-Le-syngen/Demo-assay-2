// @sys/telemetry core — the structured-event spine (Observability plane).
//
// Discipline: EMIT, NEVER DECIDE the transport. The core validates against the taxonomy,
// redacts secrets/PII, applies sampling, and hands a clean event to the host-injected Sink.
// It is PURE: `ts`/`id` are supplied on the event, and the sampling RNG is injected, so the
// same inputs always produce the same result (deterministically testable).
import type {
  TelemetryEvent,
  TelemetryConfig,
  RedactionPolicy,
  Sink,
  EmitResult,
} from './types'

/** Keys masked wherever they appear, regardless of policy. */
const DEFAULT_SENSITIVE = [
  'authorization', 'password', 'token', 'secret', 'apikey', 'api_key',
  'cookie', 'set-cookie', 'access_token', 'refresh_token', 'client_secret',
]

const MASK = '[redacted]'

/** Identity helper for a typed config. */
export function defineTelemetry(config: TelemetryConfig): TelemetryConfig {
  return config
}

type HeaderBag = Record<string, string | undefined> | Headers

/** Correlation id from inbound headers: x-request-id, then the W3C traceparent trace-id, else undefined. */
export function correlation(headers: HeaderBag): string | undefined {
  const get = (k: string): string | undefined =>
    headers instanceof Headers
      ? headers.get(k) ?? undefined
      : headers[k] ?? headers[k.toLowerCase()]
  const rid = get('x-request-id')
  if (rid) return rid
  const tp = get('traceparent') // version-traceid-spanid-flags
  if (tp) {
    const parts = tp.split('-')
    if (parts.length >= 2 && parts[1] && /^[0-9a-f]{32}$/i.test(parts[1])) return parts[1]
  }
  return undefined
}

// ── redaction (pure) ─────────────────────────────────────────────────────────

function deepClone<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(deepClone) as unknown as T
  const out: Record<string, unknown> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = deepClone(val)
  return out as T
}

function atPath(root: Record<string, unknown> | undefined, path: string): { parent?: Record<string, unknown>; key: string } {
  if (!root) return { key: '' }
  const segs = path.split('.')
  let cur: Record<string, unknown> = root
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]
    if (seg === undefined) return { key: '' }
    const next = cur[seg]
    if (next === null || typeof next !== 'object' || Array.isArray(next)) return { key: '' }
    cur = next as Record<string, unknown>
  }
  return { parent: cur, key: segs[segs.length - 1] ?? '' }
}

function maskSensitive(node: unknown, sensitive: Set<string>): void {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) maskSensitive(item, sensitive)
    return
  }
  const obj = node as Record<string, unknown>
  for (const k of Object.keys(obj)) {
    if (sensitive.has(k.toLowerCase())) obj[k] = MASK
    else maskSensitive(obj[k], sensitive)
  }
}

/** Return a redacted copy of the event (drop/mask explicit paths + mask sensitive keys at any depth). */
export function redact(event: TelemetryEvent, policy: RedactionPolicy = {}): TelemetryEvent {
  const data = deepClone(event.data)
  if (data) {
    for (const p of policy.drop ?? []) {
      const { parent, key } = atPath(data, p)
      if (parent && key) delete parent[key]
    }
    for (const p of policy.mask ?? []) {
      const { parent, key } = atPath(data, p)
      if (parent && key in parent) parent[key] = MASK
    }
    const sensitive = new Set([...(policy.sensitiveKeys ?? []), ...DEFAULT_SENSITIVE].map((s) => s.toLowerCase()))
    maskSensitive(data, sensitive)
  }
  return { ...event, data }
}

// ── validation (pure) ────────────────────────────────────────────────────────

const SEVERITIES = new Set(['debug', 'info', 'warn', 'error', 'fatal'])

/** Validate an event. `missing:`-prefixed issues are hard (block emit); others are advisory. */
export function validateEvent(event: TelemetryEvent, taxonomy?: Record<string, string[]>): string[] {
  const issues: string[] = []
  if (!event.id) issues.push('missing: id is required')
  if (!event.ts) issues.push('missing: ts is required')
  if (!event.domain) issues.push('missing: domain is required')
  if (!event.type) issues.push('missing: type is required')
  if (!SEVERITIES.has(event.severity)) issues.push(`invalid severity '${event.severity}'`)
  if (taxonomy && Object.keys(taxonomy).length > 0) {
    const types = taxonomy[event.domain]
    if (!types) issues.push(`unknown domain '${event.domain}' (not in taxonomy)`)
    else if (!types.includes(event.type)) issues.push(`unknown type '${event.domain}/${event.type}' (not in taxonomy)`)
  }
  return issues
}

// ── emit ─────────────────────────────────────────────────────────────────────

function isError(sev: TelemetryEvent['severity']): boolean {
  return sev === 'error' || sev === 'fatal'
}

/**
 * The spine entry point: validate → sample → redact → hand to the sink.
 * - A hard-invalid event (missing required field) is NOT emitted.
 * - error/fatal ALWAYS emit (never sampled out).
 * - `rand` is injected (default 0 ⇒ deterministic: everything passes the sample gate). The host
 *   passes Math.random in production.
 */
export async function emit(
  event: TelemetryEvent,
  sink: Sink,
  config: TelemetryConfig = {},
  rand: () => number = () => 0,
): Promise<EmitResult> {
  const issues = validateEvent(event, config.taxonomy)
  if (issues.some((i) => i.startsWith('missing:'))) {
    return { emitted: false, sampled: false, issues }
  }
  const rate = config.sampleRate ?? 1
  if (!isError(event.severity) && rate < 1 && rand() >= rate) {
    return { emitted: false, sampled: true, issues }
  }
  await sink.emit(redact(event, config.redaction))
  return { emitted: true, sampled: false, issues }
}
