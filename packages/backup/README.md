# @sys/backup

Incremental backup: pure primitives (diff, manifest checksum, freshness) plus a seam-injected source→sink orchestration, storage-agnostic.

**Plane:** recovery (primary), data  ·  part of the `@sys/*` reusable-subsystem monorepo.

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@sys/backup": "file:vendor/sys-backup-0.0.1.tgz"
```

## API

- `runBackup(opts): Promise<BackupResult>` — one idempotent run: copies only new/changed objects source→sink, records the run, never throws.
- `keyFor(obj): string` — destination key with the version encoded (changed source → new key, old versions retained).
- `diffForBackup(objects, existingKeys): BackupObject[]` — the incremental work set.
- `manifestChecksum(objects): string` — deterministic sha256 over sorted `path:size` lines (verification anchor).
- `backupFreshness(lastSuccess, now, maxAgeHours?): Freshness` / `evaluateFreshness(...): FreshnessDecision` — pure staleness check + alert decision.
- `BackupSource`, `BackupSink`, `BackupRunStore`, `BackupLogger`, `BackupAlert` (interfaces) — the injected adapter seams.
- `BackupObject`, `BackupResult` (types) — the object descriptor and run result.

## Usage

```ts
import { runBackup } from '@sys/backup'

const result = await runBackup({
  source,  // { list(), download(path) }      — e.g. Supabase Storage
  sink,    // { listKeys(), put(key, body) }   — e.g. S3/R2
  store,   // { open(), complete(), fail() }   — run-record table
  logger,
})
if (result.status === 'failed') throw new Error(result.error)
```

## Extend via

Source / sink / store (run-record) adapters — plus optional logger and alert seams.

## CLI

```
sys-backup
```
