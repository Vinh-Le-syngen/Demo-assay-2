# @sys/errors

Error-code **registry + classification + declarative alert routing**, as a pure engine. Part of the
observability family (`@sys/telemetry` spine → `@sys/errors` → `@sys/reporting`).

The registry **data** is consumer-specific — cadre-os carries ~76 substrate codes; a product app
carries its own. This package is the reusable **engine** over that data. It decides nothing about
delivery: error occurrences become `@sys/telemetry` events and alert *decisions*; the host emits and
notifies.

## Code taxonomy

Codes follow `DOMAIN.AREA.CONDITION` — uppercase, dot-separated. The **DOMAIN vocabulary is data**,
declared per registry, so one engine serves both shapes:

- **Substrate registries** (e.g. cadre-os): `DOMAIN ∈ {RT, INT, DOM, CTL, EXP}` — runtime / integration /
  domain / control / experience planes.
- **Product registries** (e.g. qarar): `DOMAIN` = owning component — `AUTH`, `DOC`, `AML`, `WORKFLOW`…

Set `registry.domains` to have `validateRegistry` enforce the vocabulary; omit it for shape-only
linting. `retryable` is **authoritative** — callers MUST NOT override it; `isRetryable` fails closed
on unknown codes.

## API

```ts
import {
  defineRegistry, lookup, isRetryable, domainOf,
  classify, validateRegistry, alertPlan, toTelemetryEvent,
} from '@sys/errors'

const reg = defineRegistry({ schemaVersion: 2, domains: ['RT', 'INT'], codes: [
  { code: 'RT.DB.TIMEOUT', domain: 'RT', retryable: true, remediation: 'retry w/ backoff' },
] })

validateRegistry(reg)                       // [] when clean — wire into CI as a lint gate
const code = classify(err, matchers, 'RT.UNKNOWN.UNKNOWN')
const event = toTelemetryEvent(reg, code, { id, ts, traceId })   // → emit via @sys/telemetry
const plan  = alertPlan(lookup(reg, code)!, policy)              // → { route, severity, suppress }
```

- `validateRegistry` catches contract drift: malformed codes, domain mismatch, off-vocabulary
  domains, duplicates, deprecations with no/dangling `replacedBy`.
- `alertPlan` evaluates rules in order (exact code → prefix → domain), then the policy default,
  else route `none` (suppressed).
- `toTelemetryEvent` emits domain `error`, type = code, folding `domain`/`owner`/`retryable`/
  `remediation`/deprecation into `data`. Unknown codes still emit, marked `registered: false`.

## Build

`pnpm build` (tsup, ESM+CJS+dts) · `pnpm test` (vitest) · `pnpm typecheck`.
Depends on `@sys/telemetry` for the event contract.
