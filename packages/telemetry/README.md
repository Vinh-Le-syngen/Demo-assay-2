# @sys/telemetry

> The structured-event **spine** for the Observability plane. `@sys/telemetry` owns the canonical
> event envelope, the taxonomy, correlation (traceId), and redaction — and hands a clean event to a
> host-injected **Sink**. It **emits, never decides** the transport: the host wires pino, Sentry,
> Supabase, Datadog, an audit table, or stdout.

Other observability members — `@sys/errors`, `@sys/sentinel`, `@sys/herald`, `@sys/groundskeeper` —
emit the **same `TelemetryEvent` shape**, so events correlate by `traceId` across domains and a
single `@sys/reporting` pass can aggregate one stream.

## Design

- **Pure + deterministic.** `ts` and `id` are supplied on the event; the sampling RNG is injected.
  The core never reads the clock or `Math.random`, so the same inputs always produce the same result.
- **Safe by default.** A default sensitive-key set (`authorization`, `password`, `token`, `cookie`,
  `*_token`, `client_secret`, …) is masked at any depth before any sink sees the event.
- **error/fatal always emit** — sampling only ever drops lower-severity events.

## API

```ts
import { emit, redact, correlation, validateEvent, defineTelemetry } from '@sys/telemetry'
import type { TelemetryEvent, Sink, TelemetryConfig } from '@sys/telemetry'

const config = defineTelemetry({
  taxonomy: { http: ['request', 'response'], error: ['raised'] }, // optional; unknowns warn
  redaction: { drop: ['card.number'], mask: ['email'], sensitiveKeys: ['ssn'] },
  sampleRate: 0.2, // non-error events
})

const sink: Sink = { emit: (e) => pino.info(e) } // host transport

await emit(
  { id, ts: new Date().toISOString(), domain: 'http', type: 'request', severity: 'info', traceId, data },
  sink, config, Math.random,
)
```

- `emit(event, sink, config?, rand?) → EmitResult` — validate → sample → redact → sink.
- `correlation(headers) → traceId?` — from `x-request-id`, then the W3C `traceparent` trace-id.
- `redact(event, policy?) → TelemetryEvent` — pure; never mutates the input.
- `validateEvent(event, taxonomy?) → string[]` — `missing:`-prefixed issues block emit; others advise.

## What the host supplies
The `Sink` (transport), the taxonomy values, the redaction policy, and `ts`/`id` on each event.
