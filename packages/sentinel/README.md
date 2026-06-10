# @sys/sentinel

Health monitoring: run injected dependency probes, derive overall health from a critical set, and decide whether the result is alert-worthy.

**Plane:** observability (primary), data, recovery  ·  part of the `@sys/*` reusable-subsystem monorepo.

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@sys/sentinel": "file:vendor/sys-sentinel-0.0.1.tgz"
```

## API

- `runHealth(config): Promise<HealthReport>` — run all probes; `healthy` is false if any critical dependency is not `up`.
- `healthAlert(report): { alert, summary }` — pure decision: alert when unhealthy or any dependency is down.
- `defineSentinel(config): SentinelConfig` — identity helper for a typed config.
- `Probe`, `DepStatus`, `HealthReport`, `SentinelConfig` (types) — the probe contract and outputs.
- Probe builders (`@sys/sentinel/probes`): `configProbe(name, vars)` / `checkConfig(name, vars)` (env-var presence), `httpProbe(name, { url, timeoutMs? })` (HTTP liveness).

## Usage

```ts
import { runHealth, healthAlert } from '@sys/sentinel'
import { configProbe, httpProbe } from '@sys/sentinel/probes'

const config = {
  probes: [configProbe('supabase', ['SUPABASE_URL']), httpProbe('crm', { url: 'https://crm/health' })],
  critical: ['supabase'],
}
const { alert, summary } = healthAlert(await runHealth(config))
if (alert) console.error(summary)
```

## Extend via

Probes — compose the provided builders or supply project-specific `Probe`s (DB ping, etc.).

## CLI

```
sys-sentinel
```
