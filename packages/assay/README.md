# @sys/assay

Test registry + **canonical test taxonomy** + quality gates: enforces that every test is registered, none are stale, high-risk tests declare triggers, no shell tests pass, and every test is classified into the sys-owned taxonomy by the right author.

**Plane:** governance (primary), observability, data  ·  part of the `@sys/*` reusable-subsystem monorepo.

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@sys/assay": "file:vendor/sys-assay-0.3.0.tgz"
```

Upgrading? See [MIGRATION.md](./MIGRATION.md) and [CHANGELOG.md](./CHANGELOG.md). From 0.0.1: most
consumers upgrade with no manifest edits; the only hard breaks are non-`low|medium|high|critical`
`risk` values and non-canonical `category` strings. From 0.1.0: a report-shape change only
(`AuditReport` is now a flat `findings[]`) — affects library callers, not manifests or the CLI.

## Canonical taxonomy

The test vocabulary is **owned by sys and shipped in this package** — consumers classify into it, they do not redefine it (see `docs/adr/0001-assay-canonical-test-taxonomy.md`). 12 categories across 4 layers (ported from cadre-os `test-taxonomy.yaml` v3):

| Layer | Categories |
|-------|-----------|
| correctness | unit, integration, e2e, regression, property |
| resilience | negative, adversarial, stress |
| compliance | governance, canary |
| operational | smoke, observability |

Each category carries `defaultPlanes`, `allowedAuthors`, and subtype axes (`e2e` is two-axis: `path_kind` × `profile_kind`). The taxonomy is emitted at build as `dist/taxonomy.json`, `dist/taxonomy.yaml`, and `dist/taxonomy.schema.json` (manifest JSON Schema) so non-TS runtimes (cadre-os bash) consume the **same source of truth**.

## Gates

| Gate | Default | Catches |
|------|---------|---------|
| `noUntracked` | on | test on disk not in the manifest |
| `noStale` | on | manifest entry whose file is gone |
| `requireTriggerForHighRisk` | on | `risk: high`/`critical` with no triggers |
| `noShells` | on | no-assert / statically-skipped / tautological tests |
| `validClassification` | on | `category`/`subtype` not in the taxonomy; subtracting a default plane without a reason |
| `authorSeparation` | on | author role not allowed for the category; missing author / non-independent reviewer on governance-sensitive categories |
| `coverage` | **off** | unmet per-area coverage floors (opt-in) |

Any gate can be demoted to **warn-only** via `warnOnly: ["<gate>", …]` — it's still evaluated and
printed, but never build-breaking. This is the per-gate monitor primitive for phasing a gate in
(adopt in `warnOnly`, then promote by removing it). Every gate emits a uniform `AssayFinding`
tagged with its `gate`; `report.findings` is the full list and `isFatal` is true iff any finding is
`severity: 'fatal'`.

What assay does **not** do: prove a label is semantically true, or verify a test author is independent of the *implementer* (that signal lives in cadre-os's loom, not the manifest).

## API

- `defineAssay(config): AssayConfig` — validate/normalize a project's config (testRoots, manifest path, gates, shell patterns, taxonomy escape hatch, coverage) via zod.
- `assayConfigSchema` / `manifestSchema` — the zod schemas (config contract + test manifest shape, categories validated against the taxonomy).
- `audit(config, manifest, host): AuditReport` — pure audit returning a flat `findings: AssayFinding[]` (every gate, each tagged with its `gate`) plus `total`/`onDisk`.
- `findingsForGate(report, gate)` — select one gate's findings; `isFatal(report)` — any `severity: 'fatal'`.
- `detectClassification` / `detectAuthorship` / `detectShells` / `coverageMatrix` — the per-gate checks, individually callable (all return `AssayFinding[]`).
- `discoverTests` / `AssayHost` / `nodeHost` — as before.
- `TAXONOMY`, `CATEGORIES`, `PLANES`, `ROLES`, `RISKS`, `PROFILES` + helpers (`isCategory`, `categorySpec`, `profileSpec`, …) — the canonical taxonomy, from `@sys/assay` or `@sys/assay/taxonomy`.
- Subpath exports: `@sys/assay/engine`, `@sys/assay/config`, `@sys/assay/taxonomy` (typed); `@sys/assay/taxonomy.json` / `.yaml` / `.schema.json` (raw artifacts); `@sys/assay/schema` (config JSON Schema).

### Manifest entry

```jsonc
{
  "path": "packages/auth/src/__tests__/authorize.test.ts",
  "area": "auth",
  "category": "unit",            // ∈ canonical enum
  "subtypes": { "kind": "pure" }, // axis → value (e2e: path_kind + profile_kind)
  "risk": "medium",               // low | medium | high | critical
  "author": "infra",             // required for governance | adversarial | canary
  "triggers": ["pre-merge"]
}
```

## Usage

```ts
import { defineAssay, audit, isFatal, nodeHost } from '@sys/assay'

const config = defineAssay({ testRoots: ['apps/api/src', 'apps/web/src'] })
const manifest = JSON.parse(nodeHost.readFile('tests/manifest.json') ?? '{"tests":[]}')

const report = audit(config, manifest, nodeHost)
if (isFatal(report)) {
  console.error(report)
  process.exit(1)
}
```

## Extend via

Per-project config (testRoots, manifest, gates, shell patterns) + an injected `AssayHost`.

## CLI

```
sys-assay [--strict] [--config <path>] [--report] [--json]
```

`--report` prints the coverage matrix (`area × category`, have/need, declared) stamped with the taxonomy `schema_version`; `--json` emits machine-readable output.
