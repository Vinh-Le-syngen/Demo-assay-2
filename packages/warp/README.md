# @sys/warp

Config cross-validation harness: a generic named-check runner plus reusable check builders (referential integrity, required mappings, banned-token SQL scan).

**Plane:** governance (primary), data  ·  part of the `@sys/*` reusable-subsystem monorepo.

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@sys/warp": "file:vendor/sys-warp-0.0.1.tgz"
```

## API

- `runWarp(config): Promise<WarpReport>` — run every registered check and aggregate the error lists.
- `isClean(report): boolean` — whether the report has zero errors.
- `defineWarp(config): WarpConfig` — identity helper for a typed `warp.config.mjs`.
- `Check`, `CheckResult`, `WarpReport`, `WarpConfig` (types) — the check contract and outputs.
- Check builders (`@sys/warp/checks`): `referentialCheck(name, opts)` (every `from` value exists in `to`), `requiredKeysCheck(name, opts)` (required keys present), `bannedColumnsCheck(name, opts)` + `findBannedColumns` / `hasBannedToken` (schema-genericity SQL scan).

## Usage

```ts
import { runWarp, isClean } from '@sys/warp'
import { referentialCheck } from '@sys/warp/checks'

const config = {
  checks: [
    referentialCheck('country->currency', {
      from: () => countries.map((c) => c.currency),
      to: () => Object.keys(currencies),
      message: (v) => `unknown currency: ${v}`,
    }),
  ],
}
const report = await runWarp(config)
if (!isClean(report)) process.exit(1)
```

## Extend via

Project-supplied checks — compose the provided builders or register custom `Check`s.

## CLI

```
sys-warp
```
