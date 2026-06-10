# Changelog — @sys/release

## 0.0.4

Fix: gap-B transitive-resolvability was too lenient — it treated a top-level `@sys/X: file:…`
declaration as satisfying a vendored tarball's *transitive* `@sys/X` (a registry spec). pnpm
does **not** substitute a `file:` dep for a transitive registry range (that's the original
`ERR_PNPM_FETCH_404`), so the gate wrongly passed when the consumer had the file: dep but no
override. Now a transitive `@sys/@eng` dep is "resolvable" only via a `pnpm.overrides` **or** a
*registry* (non-`file:`) declaration. Caught by a negative test while adopting into Qarar.

## 0.0.3

Fix: `nodeHost.listFiles` (used by 0.0.2's multi-manifest discovery) crashed on a **dangling
symlink** in a real consumer tree (`statSync` follows links → `ENOENT`). Now uses `lstatSync`
(never follows/recurses through symlinks) and guards `readdir`/`lstat`, so the workspace walk
is resilient to broken links, cycles, and unreadable dirs. Found adopting 0.0.2 into Qarar.

## 0.0.2

Adoption-validation hardening — closes the two gaps recorded in 0.0.1.

- **Gap A — multi-manifest discovery.** `adoption validate` now scans **every** workspace
  manifest (root + `apps/*` + `packages/*`), not just the root `package.json`. `file:` specs
  resolve relative to the declaring manifest's directory. New `discoverConsumerManifests()`.
- **Gap B — transitive resolvability.** Each vendored tarball's own `@sys/@eng` deps are
  checked: if one is neither declared by the consumer, nor in the lock, nor covered by
  `pnpm.overrides`, it raises `tarball_dep_unsatisfiable` (warning) — catching the
  `ERR_PNPM_FETCH_404` case (e.g. `@eng/governance` → `@sys/canon`) at validate time instead
  of at `pnpm install`. `TarballManifest` now carries `dependencies`.
- `validateAdoption` takes `{ manifests, overrides }` instead of a single `product`.

## 0.0.1

Initial release. Release **attestor** for the `@sys/*` monorepo — the consumer-side half of
the release system (Changesets owns producer-side versioning).

- **Release sets** — `createReleaseSet` / `validateReleaseSet`: calendar-versioned, immutable,
  provenance-bearing bundles of package + contract versions; `set validate` is a drift gate
  wired into `pnpm check`.
- **Adoption validation** — `validateAdoption`: diffs a product's `sys.lock.json` against its
  declared deps and **vendored tarball metadata** (catches `file:vendor/foo-1.1.0.tgz` whose
  tarball is really `0.0.1`).
- **Governance contract reuse** — canon-style provenance on release sets (status lifecycle,
  owner, approved_by, evidence, expires_at + freshness); findings use the `GovernanceReason`
  vocabulary folded into a `ReleaseDecision` (mirrored from `@eng/governance`, not imported —
  see `docs/design/release-governance-boundary.md`).
- Pure core + injected `ReleaseHost`; `sys-release` CLI (`set create | set validate |
  adoption validate`); zod schemas + mirrored JSON Schemas. 23 tests.
