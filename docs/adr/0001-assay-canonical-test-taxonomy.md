# ADR 0001 — Canonical test taxonomy + classification governance for `@sys/assay`

**Status:** Accepted
**Date:** 2026-06-08
**Package:** `@sys/assay` `0.0.1 → 0.1.0`
**Supersedes:** the ad-hoc, per-consumer `category` string that assay previously ignored.

## Context

`@sys/assay` governed only test *registration* (untracked, stale, high-risk-needs-trigger,
shells). Its manifest schema knew `path`, `risk?`, `triggers?` — so the `category` field
consumers already wrote (e.g. this repo's `tests/manifest.json`) was silently stripped by Zod.

Meanwhile `cadre-os` already owns a real taxonomy (`assay/test-taxonomy.yaml` v3: 12 categories,
4 layers, subtypes, `default_planes`, coverage profiles, author rules, N30 policy) — but as
bash-read YAML, **separate** from the vendored package. Two definitions guarantee drift.

## Decision

Make the taxonomy a **canonical, sys-owned, cross-system contract** shipped inside `@sys/assay`,
emitted as a single artifact both TS (assay) and bash (cadre-os) consume. Consumers classify into
the vocabulary and declare coverage posture; they cannot redefine it.

```
Sys owns        the category/subtype vocabulary, plane defaults, allowed-author sets,
                default coverage profiles. Versioned. Emitted as ONE artifact.
Recipients own  their manifest, a coverage profile (repo default + per-area), justified
                overrides. They classify into the vocabulary; they cannot narrow reality.
Assay enforces  canonical classification (category ∈ enum, subtype axis/value ∈ category),
                cheap author-separation (role membership), plane-subtraction-needs-reason,
                coverage floors — reported, stamped with taxonomy schema_version + provenance.
```

### Explicit non-goals (stated, not implied)
- Assay **cannot** prove a label is semantically true (a test tagged `adversarial` may not be).
  Defense is social: author separation + the N30 anti-patterns, not regex.
- Assay **cannot** enforce session/agent independence from the *implementer* — it sees the
  manifest, not who wrote the code under test. True independence is a **loom-side gate in
  cadre-os**, out of assay's scope. Assay enforces only author-*role* membership and the
  presence/role of a declared `reviewer`. Claiming more would itself be a `self_grading` trap.

## Canonical taxonomy (sys schema_version 1, provenance: cadre-os v3)

| Layer | Categories |
|-------|-----------|
| correctness | unit, integration, e2e, regression, property |
| resilience | negative, adversarial, stress |
| compliance | governance, canary |
| operational | smoke, observability |

- **Planes:** control, execution, data, governance, observability (per-category `defaultPlanes`).
- **Allowed authors:** infra → unit, integration, negative, regression, property, stress, smoke,
  observability · qa → governance, adversarial, e2e (+co-author) · pm → canary.
- **Governance-sensitive (author required):** governance, adversarial, canary.
- **Subtype axes:** single-axis (`kind`) for most; `e2e` is two-axis (`path_kind` × `profile_kind`).
- **Profiles:** `full` (unit, integration, e2e, regression, negative, adversarial, governance; min 2),
  `lightweight` (unit, regression; min 1), `virtual` (none — the upgrade-safe default).

## Schema changes (all additive; one tightening)

- **config:** `taxonomy.experimentalCategories` (`x-local-*`, warned, never counted);
  `coverage { profile, areaProfiles, overrides }` (nested, `reason` required, `min(12)`);
  gates `validClassification` (default on), `authorSeparation` (default on), `coverage` (default off).
- **manifest entry (all new fields optional):** `category` (∈ enum), `subtypes` (axis→value),
  `area`, `author`/`reviewer` (∈ roles), `planes` (override), `planeOverrideReason`.
- **One tightening:** `risk` becomes `enum(low|med|high|critical)`. `high`+`critical` both trip the
  existing high-risk-trigger gate. This is the single potentially-breaking change in 0.1.0.

## Findings model

Generic `AssayFinding { code, message, severity, path?, area?, category?, details? }` for all new
findings (`classification`, `authorship`, `planes`, `coverage`). The legacy `shells:{egregious,soft}`
shape on `AuditReport` is left untouched for 0.1.0 compat; migrating it onto `AssayFinding` is a 0.2.0
follow-up. `isFatal` extends to any new finding with `severity:'fatal'` (respecting gate toggles).

## Coverage counts only *effective* tests

A coverage count includes a test only if it has a `category` AND is present on disk (registered,
non-stale). Declared-but-missing entries never inflate coverage. `--report` surfaces
`declared / present / effective` so the gap between them is visible.

## Artifacts & exports

`src/taxonomy.ts` (plain `as const` data + derived enums) is the source of truth. Build emits
`dist/taxonomy.json`, `dist/taxonomy.yaml`, `dist/taxonomy.schema.json` (manifest JSON Schema with
canonical enums baked in). Package exports a typed `./taxonomy` module plus the three raw artifacts.

## Rollout

1. **sys** — build phases 1–2, bump `0.1.0`, reclassify own 34-entry manifest, rebuild tarball.
2. **Qarar** — bump vendored ref, add `category`/`author`, set `coverage.profile` + `areaProfiles`
   (`coverage` gate in monitor/warn first).
3. **cadre-os** — point bash at vendored `taxonomy.json`, retire its `test-taxonomy.yaml` as the
   editable source, align manifest fields, map N30 risk→profile onto `areaProfiles`.

## Build order

Phase 1 (this ADR): vocabulary + classification + author-separation + plane discipline + artifact
emit + reclassify sys manifest. Phase 2: coverage profiles/overrides gate + `--report` matrix.
Vocabulary and author-separation land first — coverage over an ungoverned vocabulary is noise.
