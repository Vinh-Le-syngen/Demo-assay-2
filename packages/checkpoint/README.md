# @sys/checkpoint

Git-safety gate harness: protected-branch / author / clean-tree / protected-path guards over an injected git state.

**Plane:** governance (primary), control  ·  part of the `@sys/*` reusable-subsystem monorepo.

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@sys/checkpoint": "file:vendor/sys-checkpoint-0.0.1.tgz"
```

## API

- `runCheckpoint(gates, state): CheckpointReport` — run every gate against the injected `GitState` and aggregate violations.
- `passed(report): boolean` — whether the report has zero violations.
- `defineCheckpoint(config): { gates }` — identity helper for a typed `checkpoint.config.mjs`.
- `GitState`, `Gate`, `GateResult`, `CheckpointReport` (types) — the git snapshot and gate contract.
- Gate builders (`@sys/checkpoint/gates`): `protectedBranchGate({ branches, against? })`, `authorGate({ allowed })`, `cleanTreeGate()`, `protectedPathGate({ paths, message? })`.

## Usage

```ts
import { runCheckpoint, passed } from '@sys/checkpoint'
import { protectedBranchGate, authorGate } from '@sys/checkpoint/gates'

const report = runCheckpoint(
  [
    protectedBranchGate({ branches: ['main', 'staging'] }),
    authorGate({ allowed: ['sinuhe.arroyo@gmail.com'] }),
  ],
  { targetBranch: 'main', authorEmail: 'bot@ci' },
)
if (!passed(report)) process.exit(1)
```

## Extend via

Gates — compose the provided builders or supply project-specific `Gate` checks.

## CLI

```
sys-checkpoint
```
