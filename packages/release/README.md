# @sys/release

Release **attestor** for the `@sys/*` monorepo. It records and validates releases; it does
**not** compute them. Version bumps, dependent auto-bumps, `workspace:*` → range rewriting,
changelogs, and tags are owned by **Changesets** (producer side). `@sys/release` owns the
two things Changesets does not: a **release set** (a coherent, immutable bundle of versions)
and **adoption validation** (does a product's `sys.lock.json` match what it actually
installs/vendors?).

> Governance plane. Pure core + injected `ReleaseHost`; usable as a library or the
> `sys-release` CLI. Reads versions Changesets produced — never recomputes them.

## CLI

```sh
# Producer (run in ~/projects/sys) — snapshot current workspace versions into a set
sys-release set create --name baseline --version 2026.06.0 --write
sys-release set validate            # drift gate: every set still matches the workspace

# Consumer (run in a product repo, e.g. Qarar) — validate the adoption lock
sys-release adoption validate --lock sys.lock.json --set baseline-2026.06.0.json
```

Mutating commands default to **dry-run**; pass `--write`. Validation folds findings into a
`ReleaseDecision` (`allow`/`deny`/`warn`) and exits non-zero on `deny` — any `blocker` finding,
or any `warning` under `--strict`. Add `--json` to emit the decision.

## Concepts

- **Release set** (`.releases/sets/<name>-<calver>.json`) — `{ packages, contracts, evidence }`
  plus canon-style provenance (`owner`, `approved_by`, `expires_at`). Calendar-versioned
  (`2026.06.0`); a `status` lifecycle `draft → approved → live → superseded`, immutable once `live`.
- **Adoption record** (`sys.lock.json`, in the product) — `{ product, adopts, packages, modes }`.
  Validation diffs the claim against the product's declared deps **and vendored tarball
  metadata**, catching the `file:vendor/foo-1.1.0.tgz` whose tarball is really `0.0.1`.

## Consuming `@sys/release` (qarar, cadre-os)

The CLI isn't published yet (the `@sys` GitHub Packages org is deferred). How a consumer gets
it depends on whether it's a Node project — and the two consumers differ:

### Qarar (TS / pnpm) — vendor the CLI, gate in CI

Qarar installs `@sys/*` as npm packages, so it runs the real engine. Vendor the attestor like
any other sys tool:

```sh
# in ~/projects/sys
pnpm --filter @sys/release pack --pack-destination ~/projects/qarar/vendor
```
```jsonc
// qarar/package.json
"devDependencies": { "@sys/release": "file:vendor/sys-release-0.0.1.tgz" },
"scripts": { "sys:check": "sys-release adoption validate --lock sys.lock.json --set .releases/sets/baseline-2026.06.0.json" }
```
`@sys/release` depends only on `zod` — **no `pnpm.overrides` needed** (unlike canon/governance,
whose transitive `@sys/canon` does require an override until canon is registry-published).
Enforcement is a **required CI step** beside the other sys gates:
```yaml
- name: Release adoption (@sys/release)
  run: pnpm exec sys-release adoption validate --lock sys.lock.json --set .releases/sets/baseline-2026.06.0.json
```
*(Live in `qarar/.github/workflows/ci.yml`.)* Since 0.0.2 the validator scans **all** workspace
manifests (not just the root) and flags a vendored tarball whose internal `@sys/@eng` dep the
consumer can't resolve (`tarball_dep_unsatisfiable` → "add a `pnpm.overrides`"). Still keep a real
`pnpm install` in CI as the ground-truth backstop.

### cadre-os (Python / bash) — schema-first, NO tarball

cadre-os is **not** a Node project and does **not** vendor `@sys/*` npm packages — it consumes
sys via schemas + compiled config + its own runners (e.g. `config/schema/sys-assay-cadre-config.schema.json`).
So it does **not** need the `@sys/release` tarball. Two paths:

1. **Schema-only (recommended, no Node):** validate cadre-os's `sys.lock.json` against the
   shipped [`schema/sys-lock.schema.json`](schema/sys-lock.schema.json) with Python `jsonschema`,
   wired into `scripts/ci/verify.sh`. This confirms the lock is well-formed and records which
   **contract/schema versions** cadre-os is built against (the `contracts` field) — the part that
   actually maps to cadre-os's consumption.
2. **Full engine (only if Node is on the box):** shell out to `node <path>/dist/cli.js adoption
   validate …`. But cadre-os vendors no `@sys` npm tarballs, so the tarball-metadata diff finds
   nothing — schema-only is sufficient.

> **Why the difference:** the headline check (vendored-tarball metadata vs lock) only has
> meaning for a consumer that *vendors npm tarballs*. Qarar does; cadre-os doesn't. Same lock
> schema, different enforcement surface.

### On each new sys release

1. Producer (sys): `pnpm version` → `pnpm release:pack` → `pnpm release:set` → push.
2. Consumer: drop the new `vendor/*.tgz`, bump the `file:` versions + `sys.lock.json`, copy the
   new `.releases/sets/*.json`, run `pnpm sys:check` (qarar) / the schema check (cadre-os), then
   `pnpm install`. CI re-runs the gate, so a forgotten step fails the build rather than shipping.

## API

```ts
import {
  discoverWorkspacePackages, createReleaseSet, validateReleaseSet,
  validateAdoption, parseReleaseSet, parseAdoptionRecord,
} from '@sys/release'
import { nodeHost } from '@sys/release/node-host'
```

The pure functions take an injected `ReleaseHost` (file IO + tarball-manifest read), so the
core is exercised in memory with no temp dirs. `nodeHost(root)` is the `node:fs` implementation.

## Governance contract (reused from canon/governance)

Release sets carry **canon-style provenance** — a `status` lifecycle
(`draft → approved → live → superseded`), `owner`, `approved_by`, `evidence[{source,ref}]`
(a set's passing checks ARE its evidence), and `expires_at` (freshness). Validation folds
findings into a **`ReleaseDecision`** (`allow | deny | warn`) mirroring `@eng/governance`'s
`GovernanceDecision`. These shapes are **mirrored, not imported** — release is a separate
domain from business canon; see [`docs/design/release-governance-boundary.md`](../../docs/design/release-governance-boundary.md).

## Findings

`{ code, severity: info|warning|blocker, message, derivesFrom?, package?, path? }` (the
`GovernanceReason` vocabulary). Notable codes: `release_set_version_mismatch`,
`release_set_package_missing`, `release_set_stale`, `evidence_not_recorded`,
`adoption_package_missing`, `adoption_package_version_mismatch`, `tarball_metadata_mismatch`,
`tarball_unreadable`, `tarball_dep_unsatisfiable`, `adoption_release_set_mismatch`,
`invalid_adoption_mode`.
