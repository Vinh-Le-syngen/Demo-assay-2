// @sys/telemetry types — the canonical structured-event contract (Observability plane).
// Every observability member (errors, sentinel, herald, groundskeeper, http) emits THIS shape,
// so events correlate by traceId across domains and a single reporting pass can aggregate them.

export type Severity = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

/** The canonical structured event. `ts` and `id` are host-supplied — the core never reads the
 *  clock or a RNG, so it stays pure + deterministically testable. */
export interface TelemetryEvent {
  /** Unique event id (host-supplied; a sink may also assign one). */
  id: string
  /** ISO-8601 timestamp (host-supplied). */
  ts: string
  /** Emitting domain — e.g. 'auth' | 'pay' | 'error' | 'notification' | 'health' | 'http'. */
  domain: string
  /** Specific event type within the domain — e.g. 'authn.failure', 'payment.captured'. */
  type: string
  severity: Severity
  /** Correlation id (W3C trace-id / x-request-id) — ties events across domains for one request. */
  traceId?: string
  actor?: { id?: string; type?: string }
  subject?: { id?: string; type?: string }
  /** Domain payload. Subject to redaction before any sink sees it. */
  data?: Record<string, unknown>
}

/** A transport. The host implements this (pino, Sentry, Supabase, Datadog, stdout, audit_log). */
export interface Sink {
  emit(event: TelemetryEvent): void | Promise<void>
}

/** What to strip/mask before a sink ever sees an event. */
export interface RedactionPolicy {
  /** Dot-paths in `data` to remove entirely (e.g. 'card.number'). */
  drop?: string[]
  /** Dot-paths in `data` to replace with the mask token. */
  mask?: string[]
  /** Keys masked wherever they appear at any depth (case-insensitive). Added to a safe default set. */
  sensitiveKeys?: string[]
}

export interface TelemetryConfig {
  /** Allowed domain → types. Absent/empty = unconstrained (events still emit; unknowns warn). */
  taxonomy?: Record<string, string[]>
  redaction?: RedactionPolicy
  /** Fraction (0..1) of NON-error events to emit. error/fatal always emit. Default 1. */
  sampleRate?: number
}

/** Outcome of an emit() call. */
export interface EmitResult {
  /** True if the event was handed to the sink. */
  emitted: boolean
  /** True if it was dropped by sampling (not an error/fatal). */
  sampled: boolean
  /** Advisory issues (unknown domain/type, etc.). A `missing:` issue means it was NOT emitted. */
  issues: string[]
}
