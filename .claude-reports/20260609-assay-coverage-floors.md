# Assay coverage floors + full test build-out (full everywhere, enforced)

**Date:** 2026-06-09
**Status:** SUCCESS — 210 tests, `full` floor enforced (coverage gate fatal) across all 21 packages
**Branch:** `feat/assay-coverage-floors` (worktree `../sys-assay-coverage`)

## Goal
Use `@sys/assay` to govern the test battery of every `@sys/*` package: (1) reclassify the
all-`unit` manifest honestly, (2) turn on coverage floors at the `full` profile, (3) enforce
that every present/future package is bound to a floor, (4) start closing the gap on the
highest-risk systems. Posture chosen by Sinu: **full everywhere**, sequenced **framework-first**
(coverage gate in `warnOnly` so CI stays green while the battery is built out).

## What Was Done
- **Reclassified the 46 existing tests** from all-`unit` into the canonical 12-category taxonomy
  (4 parallel readers judged each by its actual assertions): 32 unit, 6 governance, 6 integration,
  2 negative. Author roles corrected (governance tests → `qa`; high-risk governance → `qa` author +
  `infra` reviewer) to satisfy `authorSeparation`.
- **Wired the coverage gate** in `assay.config.json`: `gates.coverage: true`, global
  `coverage.profile: full`, all 21 areas enrolled in `coverage.areaProfiles`, gate listed in
  `warnOnly` — floors are evaluated and printed but non-breaking during phase-in.
- **Made `taxonomy.yaml` the single source of truth for the test floor (canon-aligned).** Added a
  provenance-bearing `test_profile` field (+ a `test_profiles` enum) to each of the 21 package
  entities — `taxonomy.yaml` is "the `@sys/canon` pattern applied to the repo's own packages," so
  the test posture lives there alongside `owner`/`status`/`primary_plane`, validated by
  `check-taxonomy.mjs` (BLOCK if missing/invalid).
  - `assay.config.json` `coverage.areaProfiles` is now a **generated artifact**:
    `scripts/gen-assay-areas.mjs` (`pnpm gen:assay-areas`) derives it from `taxonomy.yaml`. No more
    hand-maintained second package registry.
  - `scripts/check-assay-areas.mjs` is now a **drift gate**: it re-derives the map from
    `taxonomy.yaml` and fails if the committed config differs. Verified all paths — in-sync passes;
    a hand-edited `areaProfiles` **exits 1**; a new package entity added to `taxonomy.yaml` without
    regen **exits 1** ("not enrolled"). A new sys cannot land without a `taxonomy.yaml` entry
    (already mandatory) carrying a `test_profile`, which flows through to the coverage floor.
  - Wired into the `assay` and `check` npm scripts.
- **Wrote 26 new passing tests** across the 4 highest-risk systems (4 parallel authors, real
  exported APIs only, verified `pnpm --filter <pkg> test` green):
  - auth (6): 2 adversarial (token abuse / authorize protocol-misuse), 2 governance (authz mapping /
    deny-precedence), 2 regression (returnUrl / session-expiry).
  - pay (7): 2 negative, 2 adversarial (webhook forgery+replay / idempotency abuse), 2 governance
    (fulfilment-gate / gate-wiring), 1 integration (webhook-driven lifecycle).
  - vault (5): 1 unit boundary, 1 negative, 1 adversarial (access-bypass), 1 governance
    (access-policy matrix), 1 integration (upload→replace→share lifecycle + audit).
  - billing (8): 2 negative, 2 adversarial (HTML-injection escaping / numbering-series abuse),
    2 governance (tax-policy / numbering-linkage), 2 regression (rounding / out-of-scope totals).
- Manifest now **72 tests**: unit 33, governance 13, integration 8, negative 7, adversarial 7,
  regression 4.

## What Failed (and was fixed)
- Three sub-agents edited `tests/manifest.json` concurrently → lost-update corruption (66 entries
  instead of 72). **Fixed** by rebuilding the manifest deterministically from a single known source
  list (with on-disk existence + duplicate checks), not trusting the concurrent edits.
- vault `negative.test.ts` passed vitest but failed `tsc --noEmit` (unsafe `as Record<…>` cast on
  the `Vault` type). The authors ran `pnpm test` (no typecheck); `pnpm check` caught it. **Fixed**
  the cast (`as unknown as Record<string, unknown>` via a loop).
- `@eng/governance` typecheck failed on a fresh worktree because `@sys/canon`'s `.d.ts` didn't
  exist yet (build-order, not a code defect). Resolved by `pnpm -r build` to populate `dist`.

## Test Results
- `pnpm check` (boundaries → taxonomy → typecheck → test → assay+guard → release): **exit 0**.
- `assay`: 72 registered, 72 on disk — warnings only (coverage gaps printed, non-fatal).
- `check:assay-areas` (drift gate): in-sync passes; hand-edited `areaProfiles` → exit 1; new
  `taxonomy.yaml` package entity without regen → exit 1. `check:taxonomy`: validates `test_profile`.
- `check:release`: ALLOW release_set:baseline@2026.06.0 — 0 findings.

## Phase 2 — full build-out + promotion to fatal (this session, continued)
- **Built every package to the `full` floor.** Fanned out per-package agents (2 build-out waves +
  1 split wave, ~45 agents) writing genuine, passing tests for every applicable category and
  proposing justified overrides for the rest. Critical correction discovered mid-flight: assay
  counts coverage **per file** (one manifest entry per path), so categories with two `it`-blocks in
  one file read 1/2 — a split wave gave every applicable category two distinct files.
- **Manifest grew 72 → 210 tests**, deterministically rebuilt with a disk-reconciliation guard
  (every on-disk test registered, every entry on disk). Spread: unit 48, negative 42, integration
  38, adversarial 36, governance 28, e2e 14, regression 4.
- **Justified overrides live in `taxonomy.yaml`** as per-entity `test_overrides` (category →
  `{required:false, reason}`), projected into `assay.config.json` by the generator and drift-checked.
  19 packages carry overrides (e2e/regression on pure libs; adversarial/governance where there is no
  hostile-input surface or policy decision). Each reason is package-specific and substantive
  (`check-taxonomy.mjs` enforces ≥12 chars). auth and billing meet all 7 categories with no override.
- **Coverage gate promoted out of `warnOnly` → fatal.** Every cell is now met by a real test or a
  justified override; `assay` exits non-zero on any future regression.
- A real source bug surfaced and was flagged out-of-scope: `@sys/backup` `manifestChecksum` joins
  `path:size` with `\n`, so a path containing `:`/`\n` can forge a colliding digest (spawned task).

## Test Results (final)
- `pnpm check` (boundaries → taxonomy → typecheck → 210 tests → assay+guard → release): **exit 0**.
- `assay: ok (210 registered, 210 on disk)` with the **coverage gate fatal** — full floor met for
  all 21 packages.
- `check-assay-areas` drift gate: areaProfiles + overrides match `taxonomy.yaml`.

## Phase 3 — follow-ups resolved
- **`@sys/backup` `manifestChecksum` collision fixed at source.** `core.ts` now encodes each entry
  as `JSON.stringify([path, size])` instead of a forgeable `${path}:${size}` delimiter join (a path
  embedding `:`/`\n` could otherwise reproduce another set's joined bytes). The exact collision case
  (`[{path:'a:1\nb',size:2}]` vs `[{path:'a',size:1},{path:'b',size:2}]`) is asserted in
  `backup/adversarial.test.ts` and now passes; backup's `regression` override reason updated to
  record that this fixed bug is guarded.
- **`noShells` gate enabled (fatal).** It was tripping only on false positives — assay's own
  shell-detector self-tests (`engine.test.ts`, `adversarial.test.ts`) legitimately contain shell
  patterns (`describe.skip(...)`, `expect(true).toBe(true)`) as fixture *strings*. Moved those into a
  non-test `__tests__/_shell-fixtures.ts` module (assay's `testPattern` `\.(test|spec)\.(ts|tsx)$`
  neither discovers nor scans it), so the detector sees the patterns only at runtime via `memHost`.
  `noShells` now passes clean and enforces against real shell tests.

## Remaining (follow-ups)
- Most packages keep `regression` justifiably overridden (reasons name what covers each edge); add
  real regression guards as concrete bugs are fixed (backup already demonstrates the pattern).

## (Superseded) earlier remaining list — framework-first phase
- ~17 packages still at the floor only for `unit`; `full` needs unit/integration/e2e/regression/
  negative/adversarial/governance ×2 each (~294 effective tests target vs 72 now).
- `e2e` floors warn on pure stateless engines where e2e doesn't apply — these should become
  **justified `coverage.overrides[area].e2e = { required:false, reason }`**, not synthetic tests.
- vault `negative` and `adversarial` are at 1/2 — add one each to meet the floor.
- Promote `coverage` out of `warnOnly` once floors are met (or justified-overridden).
- Consider enabling assay's `noShells` gate (currently `false`) for shell-test detection.

## Files Changed
| File | Change |
|------|--------|
| `tests/manifest.json` | reclassified 46 + registered 26 new = 72 entries (deterministic rebuild) |
| `taxonomy.yaml` | added `test_profiles` enum + `test_profile: full` to all 21 package entities (SoT for the floor) |
| `assay.config.json` | coverage gate on, `full` profile, `warnOnly:[coverage]`; `areaProfiles` now GENERATED |
| `scripts/gen-assay-areas.mjs` | NEW — derives `areaProfiles` from `taxonomy.yaml` |
| `scripts/check-assay-areas.mjs` | NEW — drift gate: committed `areaProfiles` must match `taxonomy.yaml` |
| `scripts/check-taxonomy.mjs` | validate `test_profile` presence + value (BLOCK) |
| `package.json` | added `check:assay-areas` + `gen:assay-areas`; chained guard into `assay` |
| `packages/{auth,pay,vault,billing}/src/__tests__/*.test.ts` | 26 NEW resilience/compliance tests |

## Git Commit
`9a9b9fe`
