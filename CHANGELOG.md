# Changelog — sys monorepo

Repo-level milestones (package additions, governance/tooling changes). Per-package release
history lives in each `packages/<name>/CHANGELOG.md`.

## 2026-06-08 — release & versioning system

- **Changesets adopted (producer side).** Versioning, dependent auto-bumps, `workspace:*` →
  real-range rewrite, changelogs, and tags are now owned by Changesets, not by hand.
  `.changeset/config.json` (restricted, `updateInternalDependencies: patch`); root scripts
  `changeset` / `version` / `release:set` / `release:pack` / `release:publish`. The blunt
  `release` script is kept only as a fallback. Proven: a `@sys/canon` change auto-bumps
  `@eng/governance` and the packed tarball carries a real range — the manual pin is retired.
- **New package `@sys/release` (the attestor).** Governance plane. Release sets (calendar-
  versioned immutable bundles; `set validate` drift gate wired into `pnpm check`) + product
  adoption validation (`sys.lock.json` vs declared deps + vendored tarball metadata). Reuses
  canon/governance provenance + decision contract (mirrored, not merged — ADR
  `docs/design/release-governance-boundary.md`). Now **21 packages**.
- **`@sys/canon` + `@eng/governance` → `1.0.0`.** Promoted out of `0.x` (load-bearing,
  consumed, internal-dep target). `baseline@2026.06.0` release set captures all 21 versions.
- **Scope policy: `@eng/*` vendored-only.** Only `@sys/*` (19) is registry-published; the two
  `@eng/*` engines are versioned/tagged but never pushed (`release:publish` filters to
  `@sys/*`). See `DISTRIBUTION.md`.
- **First product adoption (Qarar).** Vendored `@sys/canon` + `@eng/governance`; `sys.lock.json`
  adopting `baseline@2026.06.0`; validated ALLOW/DENY. Surfaced that the interim still needs a
  consumer `pnpm.overrides` for transitive vendored deps until `@sys/canon` is published —
  `DISTRIBUTION.md` corrected accordingly.

## 2026-06-08

- **Plane doctrine recorded.** New `PLANES.md` is the canonical record of both five-plane axes —
  System Planes (P5: Control/Data/Observability/Governance/Recovery) and Business Planes
  (Market/Offering/Interaction/Delivery/Financial) — with the one-lens rule, the business-capability
  vs platform distinction, and the per-package mapping. README + `taxonomy.yaml` point to it.
- **Two plane axes wired into the catalog.** README front-door fixed (no longer implies a single
  plane set); `taxonomy.yaml` gains an optional, gate-validated `business_planes` field. Populated
  from Qarar's `planes.md §7`: `billing`/`pay` → Financial, `vault` → Delivery. Platform / cross-cutting
  systems intentionally carry none (they serve every Business plane). Wording is "business-capability",
  not "commercial" — Delivery isn't a revenue concern, but `vault` lives there.
- **Package-catalog governance.** `taxonomy.yaml` upgraded with per-package provenance
  (`owner`, `last_reviewed`, `status`); `scripts/check-taxonomy.mjs` grown into the catalog gate —
  blocks on missing README / incomplete provenance / unclassified package, warns on missing
  CHANGELOG / `0.0.0` version / unassigned owner / stale review. The `@sys/canon` pattern applied
  to the repo's own packages.
- **Version hygiene.** Every package now carries a `CHANGELOG.md` (shipped in the tarball) and a
  real version; `@sys/dialog`, `@sys/model-router`, `@sys/rag` bumped `0.0.0 → 0.0.1`. Versioning /
  bump policy documented in `CONVENTIONS.md`.
- **Documentation.** Every package has a README; root README lists all 20 packages with plane +
  one-line purpose. (READMEs added for `consent`, `dialog`, `governance`, `model-router`, `rag`,
  `workflow`.)
- **`@sys/assay` 0.1.0 → 0.3.0** (on `staging`, pending promotion): canonical test taxonomy +
  classification/author/coverage gates + per-gate `warnOnly` monitor.

## 2026-06-03

- **Initial extraction from Qarar.** 20 reusable subsystems lifted into the `@sys/*` / `@eng/*`
  monorepo, each classified in `taxonomy.yaml` across the 5 system planes. Membership rule in
  `MEMBERSHIP.md`; package anatomy + conventions in `CONVENTIONS.md`; vendoring runbook in
  `DISTRIBUTION.md`.
