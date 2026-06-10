# Changelog — @sys/assay

## 0.3.0

Risk vocabulary aligned (taxonomy `schema_version: 2`).

### Changed (breaking — manifests)
- The `risk` enum is now `low | medium | high | critical` (was `low | med | high | critical`):
  `med` → `medium`. This aligns the canonical contract with cadre-os and ordinary usage before any
  consumer vendors it. A manifest using `med` now fails to parse — replace it with `medium`.
- `TAXONOMY.schema_version` bumped 1 → 2; provenance records the alignment.

## 0.2.0

Unified findings model + per-gate warn-only monitor mode.

### Added
- **`warnOnly` config** (array of gate names): demotes a gate's fatal findings to warn — evaluated
  and printed, never build-breaking. The per-gate monitor primitive: adopt a gate in `warnOnly` to
  see its violations without failing CI, then promote it by removing it from the list. Cleaner than
  "run without `--strict`", which muted every gate at once.
- `findingsForGate(report, gate)` selector; `--json` audit output now includes a `fatal` boolean.

### Changed (breaking — library consumers)
- **`AuditReport` is now `{ findings: AssayFinding[], total, onDisk }`.** The previous per-gate
  fields (`untracked`, `stale`, `highRiskNoTrigger`, `shells`, `classification`, `authorship`,
  `coverage`) are gone — every gate now emits a uniform `AssayFinding` tagged with its `gate`.
  Migrate `report.untracked` → `findingsForGate(report, 'noUntracked')`, `report.shells.egregious`
  → `findingsForGate(report, 'noShells').filter(f => f.severity === 'fatal')`, etc.
- `AssayFinding` gained a required `gate: GateName` field. `detectShells` now returns
  `AssayFinding[]` (was `{ egregious, soft }`); `detectClassification`/`detectAuthorship` unchanged
  in spirit but each finding carries `gate`.

### Unchanged
- CLI behavior and exit codes (output is grouped by gate); the canonical taxonomy and all gate
  semantics. The 0.1.0 manifest/config schema is unaffected — this is a report-shape change only.

## 0.1.0

Canonical test taxonomy + classification governance. The test vocabulary is now sys-owned and
shipped in the package (ported from cadre-os `test-taxonomy.yaml` v3); consumers classify into it
and declare coverage posture rather than inventing categories. See
`docs/adr/0001-assay-canonical-test-taxonomy.md` and `MIGRATION.md`.

### Added
- **Canonical taxonomy** (`@sys/assay/taxonomy`): 12 categories / 4 layers / subtype axes (e2e is
  two-axis) / default planes / allowed authors / coverage profiles, stamped `schema_version: 1` +
  provenance. Emitted at build as `dist/taxonomy.json`, `dist/taxonomy.yaml`, and
  `dist/taxonomy.schema.json` (manifest JSON Schema) for non-TS runtimes.
- **Gates** (default on): `validClassification` (category/subtype ∈ taxonomy; plane-subtraction
  needs a reason), `authorSeparation` (author-role membership; required author + independent
  reviewer for governance/adversarial/canary). **Default off:** `coverage` (per-area profile floors,
  counting only effective/present tests).
- **Manifest fields** (all optional): `category`, `subtypes`, `area`, `author`, `reviewer`,
  `planes`, `planeOverrideReason`. `category` also accepts an `x-local-*` experimental value
  (warned, never counted toward coverage).
- **Config**: `taxonomy.experimentalCategories`, `coverage { profile, areaProfiles, overrides }`
  (nested; `reason` mandatory).
- **CLI**: `--report` (coverage matrix) and `--json`. Malformed config/manifest now fail with a
  readable message instead of a stack trace.
- Generic `AssayFinding` type for the new findings.

### Changed (breaking, despite the minor bump — pre-1.0)
- `risk` is now a closed enum: `low | med | high | critical`. A manifest using any other risk
  string fails to parse. `high` **and** `critical` now trip `requireTriggerForHighRisk`.
- `category`, if present, must be a canonical category or an `x-local-*` string. Arbitrary
  category strings fail to parse.

### Unchanged / compatible
- Manifests that use only `path` (+ standard `risk`/`triggers`) upgrade with no edits — the new
  gates no-op on entries without a `category`. The `coverage` gate is off by default.
- The legacy `shells: { egregious, soft }` shape on `AuditReport` is preserved.
