# Assay v0.1.0 — Canonical test taxonomy + classification governance

**Date:** 2026-06-08
**Status:** SUCCESS (Phase 1 + Phase 2 in `@sys/assay`; consumer rollout pending)
**Branch / worktree:** `feat/assay-taxonomy` @ `../sys-assay-taxonomy`

## What Was Done
- Added `packages/assay/src/taxonomy.ts` — the canonical, sys-owned test taxonomy (12 categories / 4 layers / subtype axes / default planes / allowed authors / coverage profiles), ported from cadre-os `assay/test-taxonomy.yaml` v3, stamped `schema_version: 1` + provenance.
- Extended `config.ts`: `taxonomy.experimentalCategories` (`x-local-*`), `coverage { profile, areaProfiles, overrides }` (nested, `reason` min 12), gates `validClassification`/`authorSeparation` (default on) + `coverage` (default off). Manifest entry gains `category`, `subtypes`, `area`, `author`, `reviewer`, `planes`, `planeOverrideReason`; `risk` closed to `low|med|high|critical`.
- Extended `engine.ts`: generic `AssayFinding`; `detectClassification` (category/subtype validity, plane-subtraction-needs-reason, experimental warns), `detectAuthorship` (role membership, required author + independent reviewer for governance-sensitive), `coverageMatrix` (counts only effective/present tests). `isFatal` extended; legacy `shells` shape preserved for compat.
- `cli.ts`: prints new finding groups; `--report` coverage matrix + `--json`.
- Build emits `dist/taxonomy.{json,yaml,schema.json}` via `scripts/emit-taxonomy.mjs` (tsup `onSuccess`); package exports typed `./taxonomy` + raw artifacts. `yaml` added as devDep. Version `0.0.1 → 0.1.0`.
- Updated config JSON Schema mirror + README; added `docs/adr/0001-assay-canonical-test-taxonomy.md`.
- Reclassified repo manifest: 34 → 42 entries (registered 8 pre-existing untracked tests), all `unit` with `subtypes.kind` (pure/io) + `author: infra`.

## What Failed
- Nothing outstanding. Two iterations fixed: `z.record(enum,…)` → `z.partialRecord` (zod 4 exhaustive-record); existing `config.test.ts` gate-shape assertion updated.

## Test Results
- `pnpm typecheck`: clean. `pnpm test`: 27 passed (3 files).
- `sys-assay --config assay.config.json --strict`: `ok (42 registered, 42 on disk)`, exit 0.

## Files Changed
| File | Change |
|------|--------|
| packages/assay/src/taxonomy.ts | NEW — canonical taxonomy + derived enums/helpers |
| packages/assay/src/config.ts | taxonomy/coverage/gates + richer manifest schema |
| packages/assay/src/engine.ts | AssayFinding + classification/author/coverage gates |
| packages/assay/src/cli.ts | new findings output + `--report`/`--json` |
| packages/assay/src/index.ts | export taxonomy |
| packages/assay/scripts/emit-taxonomy.mjs | NEW — emit json/yaml/schema artifacts |
| packages/assay/tsup.config.ts | taxonomy entry + onSuccess emit |
| packages/assay/package.json | v0.1.0, exports, yaml devDep |
| packages/assay/schema/assay.config.schema.json | mirror config additions |
| packages/assay/README.md | taxonomy/gates/CLI docs |
| packages/assay/src/__tests__/taxonomy.test.ts | NEW — 14 tests |
| packages/assay/src/__tests__/config.test.ts | updated assertions |
| docs/adr/0001-assay-canonical-test-taxonomy.md | NEW — ADR |
| tests/manifest.json | reclassified, 34 → 42 entries |

## Hardening + docs (follow-up commits)
- End-to-end CLI battery (10 fatal gates, soft warns, coverage gap + waiver, report/json, error paths) — all correct.
- Fixed: `x-local-*` hatch was unreachable (manifest enum rejected it pre-engine) → `category` now accepts canonical or `x-local-*`; malformed config/manifest now fail with readable messages, not stack traces.
- Added `CHANGELOG.md` + `MIGRATION.md` (0.0.1→0.1.0), shipped in the tarball; linked from README; updated root README assay row. Migration: only hard breaks are non-`low|med|high|critical` risk and non-canonical category strings; new gates no-op on unclassified entries; non-strict run = monitor mode.

## 0.2.0 — unified findings + warnOnly monitor
- `AuditReport` collapsed to a flat `findings: AssayFinding[]` (each tagged with `gate`); `shells` migrated off its bespoke `{egregious,soft}` shape onto the generic finding. `findingsForGate()` selector added; `isFatal` = any fatal finding.
- `warnOnly: GateName[]` config — demotes a gate's fatal findings to warn (printed, never build-breaking, even under `--strict`), per-gate, without muting other gates. The clean monitor primitive (vs all-or-nothing non-strict).
- Verified: 31 tests green, typecheck clean, repo self-audit ok, CLI warnOnly demotes untracked→warn (exit 0) while a sibling fatal gate still fails. README/CHANGELOG/MIGRATION updated; tarball → `sys-assay-0.2.0.tgz`.

## 0.3.0 — risk vocabulary aligned
- cadre data showed our `med` collided with cadre's (and standard) `medium`. Confirmed `med`→`medium` is the only sys-side defect the analysis justified; the 4 "extra" cadre categories (audit/journey/coverage/portability) are defined in NEITHER cadre taxonomy → genuine drift, so the canonical 12 stand (assay would correctly flag them on adoption).
- Changed canonical `RISKS` to `low|medium|high|critical`, `schema_version` 1→2 (provenance notes alignment), migrated sys's 42-entry manifest med→medium, bumped 0.3.0, repacked tarball. 31 tests green, typecheck clean, repo self-audit ok, emitted manifest schema risk enum = low,medium,high,critical.

## Real-consumer migration finding (cadre-os, 1,649 entries)
Upgrade is NOT zero-friction for the richest consumer. Parse-breaks: `risk: medium` (336 — we chose `med`), categories `audit/journey/coverage/portability` (65) and planes `reconciliation/policy` (27) that aren't in canonical v3. Plus 1,614 `subtype`(singular)→`subtypes` renames and 301 author-separation violations. Surfaces 3 open decisions before cadre rollout: (a) is the canonical set already stale vs cadre's live usage? (b) `med` vs `medium`? (c) are the author violations real or is the rule wrong? Deferred — sys-only for now per direction.

## Next (separate worktrees, not this session)
- Qarar: bump vendored ref to `sys-assay-0.1.0.tgz`, add `category`/`author`, set `coverage.profile` + `areaProfiles` (gate in monitor first).
- cadre-os: point bash at vendored `taxonomy.json`, retire `assay/test-taxonomy.yaml` as the editable source, align manifest fields, map N30 risk→profile.

## Git Commit
`e13ca23` (implementation). Report hash corrected in a follow-up commit.
