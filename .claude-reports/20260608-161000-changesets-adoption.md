# Release system — Changesets (producer) + @sys/release (attestor)

**Date:** 2026-06-08
**Status:** SUCCESS — complete solution built; `pnpm check` green (exit 0)
**Branch / worktree:** `feat/release-changesets` @ `~/projects/sys-release`

## Final shape (clean slate)
- **Producer = Changesets**: version bumps, dependent auto-bumps, `workspace:*` → range
  rewrite, changelogs, tags. Proven: a `@sys/canon` change bumps `@eng/governance` and the
  packed tarball carries a real range. Proof bumps were reset; clean baseline kept.
- **Consumer = `@sys/release`** (new package, the attestor): release sets + adoption
  validation. Pure core + injected `ReleaseHost`, `sys-release` CLI, 18 tests, classified
  in `taxonomy.yaml`, drift gate wired into `pnpm check`. Born in /sys (origin: sys).
- **Artifacts**: `baseline@2026.06.0` release set (21 packages); example `sys.lock.json`;
  docs (README/MEMBERSHIP/DISTRIBUTION updated; package README + design doc).
- **Commits**: `ef80db1` (Changesets + normalize), `09c510d` (@sys/release), + docs commit.

## What Was Done
- **Phase 0 — normalize versions:**
  - thin-clients `@sys/dialog`, `@sys/model-router`, `@sys/rag` 0.0.0 → 0.0.1
  - `@sys/canon` + `@eng/governance` → 1.0.0 (consumed / internal-dep target; real SemVer)
  - confirmed only the workspace root is `private: true`
- **Phase 1 — Changesets:**
  - `pnpm add -Dw @changesets/cli` (v2.31), `changeset init`
  - default config already matched spec (schema 3.1.4, `access: restricted`, `baseBranch: main`, `updateInternalDependencies: patch`) — no edit needed
  - root scripts added: `changeset`, `version`, `release:pack` (→ `.releases/artifacts`), `release:publish`; blunt `release` left in place
  - `.releases/artifacts/` created (tarballs gitignored)
- **Proof run (the acceptance test):**
  - changeset: `@sys/canon` minor
  - `changeset version` → canon 1.0.0→1.1.0, **governance dependent-bumped 1.0.0→1.0.1** automatically; CHANGELOGs generated (governance's records the dep bump)
  - built + packed both to `.releases/artifacts/`
  - **PASS:** packed `eng-governance-1.0.1.tgz` `package.json` shows `"@sys/canon": "1.1.0"` — `workspace:*` rewritten to a real version in the artifact. The manual pin + `pnpm.overrides` runbook is now unnecessary.

## What Failed
- Nothing. (Two transient hiccups self-resolved: worktree needed `pnpm install` before build/pack; shell `*.tgz` glob nomatch was a display artifact, files were present.)

## Test Results
- canon: `1.1.0` (source + tarball); governance: `1.0.1`
- packed governance dep: `@sys/canon@1.1.0` (no `workspace:` protocol) → assertion PASS
- CHANGELOGs present for both packages

## Files Changed
| File | Change |
|------|--------|
| package.json | +changeset/version/release:pack/release:publish scripts; +@changesets/cli dep |
| .changeset/config.json, README.md | Changesets init (committed in baseline) |
| .releases/artifacts/ | new producer output dir (.gitkeep, .gitignore) |
| packages/{dialog,model-router,rag}/package.json | 0.0.0 → 0.0.1 |
| packages/canon/package.json | 1.0.0 → 1.1.0 (proof bump, uncommitted) |
| packages/governance/package.json | 1.0.0 → 1.0.1 (dependent bump, uncommitted) |
| packages/{canon,governance}/CHANGELOG.md | generated (uncommitted) |

## Git Commit
- Baseline committed: `ef80db1` (config + normalization)
- Proof-run version bumps + CHANGELOGs: **uncommitted**, awaiting decision (keep as real first release vs. reset)

## Next (not done — awaiting direction)
- Decide: commit proof bumps as the genuine first release, or `git checkout` to reset and re-cut later.
- Product adoption attempt: have Qarar consume the two tarballs from `.releases/artifacts/` with no `pnpm.overrides`. This is the trigger for Phase 2 (`@sys/release` attestor).
- Push branch / open PR when ready.
