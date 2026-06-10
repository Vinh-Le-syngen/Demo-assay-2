# @sys/warden

Worktree↔agent ownership — *who holds which git worktree*, for repos run by many parallel
agents + humans under a "one worker, one branch, one worktree" rule.

**Plane:** observability (primary), control · part of the `@sys/*` reusable-subsystem monorepo.

It does **not** invent a new decision engine — it **reuses** the platform's existing ones:

- **liveness** → `@sys/sentinel` (`runHealth`): each worktree is a health probe (owned+alive = up).
- **reclaim** → `@sys/groundskeeper` (`agingDetector`): abandoned worktrees aged past a grace window.
- plus an **atomic claim lease** (`mkdir`) for workers the harness can't see (humans, non-Claude tools).

Both reused engines are **bundled into the build** (tsup `noExternal`), so the tarball / CLI is
self-contained — no runtime `@sys` dependencies for consumers.

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@sys/warden": "file:vendor/sys-warden-0.0.1.tgz"
```

Non-node consumers can instead run the self-contained CLI bundle directly: `node dist/cli.cjs status`.

## CLI

```
sys-warden status     # who owns which worktree: live | stale | reclaimable | free
sys-warden claim [id] # atomically claim the CURRENT worktree (humans / non-Claude workers)
sys-warden release    # release the current worktree
```

`status` is read-only — it joins `git worktree list` × the harness session registry
(`~/.claude/sessions/<pid>.json`, by cwd) × `.wt-claim.d` claims. Liveness is PID-reuse-safe
(process start vs recorded session start, epoch-compared via `ps -o lstart=` → timezone-independent).
`claim`/`release` write only a local `.wt-claim.d/` marker (gitignore it).

## Library API

- **`./core`** (pure, injectable — `IsAlive` + the clock are passed in):
  `classifyWorktrees`, `ownershipHealth` (→ `@sys/sentinel` report), `reclaimableFindings`
  (→ `@sys/groundskeeper` findings), `ownershipProbes`, plus the `WorktreeRecord` / `WorktreeOwner` types.
- **`./claim`**: `claimWorktree` (atomic), `renewClaim`, `releaseWorktree`, `readClaim`.
- **`./adapters`** (node I/O): `collectRecords`, `gitWorktrees`, `sessionOwners`, `isAlive`, `currentWorktree`.
