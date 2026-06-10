# @sys/groundskeeper

Operational-hygiene detectors: run injected detectors, summarize findings, and decide whether to alert.

**Plane:** observability (primary), governance  ·  part of the `@sys/*` reusable-subsystem monorepo.

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@sys/groundskeeper": "file:vendor/sys-groundskeeper-0.0.1.tgz"
```

## API

- `runHousekeeping(config, ranAtIso): Promise<HousekeepingReport>` — run every detector and summarize.
- `summarize(findings, ranAtIso): HousekeepingReport` — aggregate findings into counts + high-severity total.
- `evaluateHousekeeping(report): HousekeepingDecision` — pure alert decision (high-severity findings page; warnings surface in the report).
- `defineGroundskeeper(config): GroundskeeperConfig` — identity helper for a typed config.
- `Detector`, `Finding`, `Severity`, `HousekeepingReport`, `HousekeepingDecision` (types) — the detector contract and outputs.
- Detector builders (`@sys/groundskeeper/detectors`): `agingDetector(name, opts)` (rows older than a threshold), `expiryDetector(name, opts)` (two-tier: expired → high, expiring soon → warning).

## Usage

```ts
import { runHousekeeping, evaluateHousekeeping } from '@sys/groundskeeper'
import { expiryDetector } from '@sys/groundskeeper/detectors'

const config = {
  detectors: [
    expiryDetector('docs', {
      rows: () => documents, nowMs: Date.now(),
      expiresAt: (d) => d.expires_at,
      subject: (d) => d.id, expiredDetail: () => 'expired', expiringDetail: () => 'expiring soon',
    }),
  ],
}
const decision = evaluateHousekeeping(await runHousekeeping(config, new Date().toISOString()))
if (decision.alert) console.error(decision.summary)
```

## Extend via

Detectors — compose the provided builders or supply project-specific `Detector`s and rows.

## CLI

```
sys-groundskeeper
```
