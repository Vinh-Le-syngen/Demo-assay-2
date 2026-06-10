# Anatomy of a `@sys/*` package

Every reusable subsystem here follows the same shape, so it drops into **any** consumer
(Qarar, cadre-os, a new app) with only a config + injected seams — never a code change.
This is the contract that makes "configurable, cross-project" real. `@sys/auth` is the
reference implementation.

## The five rules

1. **Owns one plane, integrates the rest by injection.** Classify the package by the
   plane it owns (`taxonomy.yaml`); reach every other plane through an **injected seam**,
   never by owning it. e.g. auth owns Control; Data (backend adapter), Governance
   (permission model), Observability (event sink), Recovery (session policy) are injected.

2. **Configurable via one composition root.** Expose a `defineX(config)` that validates
   (zod) and normalizes an **isomorphic, secrets-free** config object. A consumer adapts
   the package by writing its own config — enable a subset, point at its own data, set its
   own policy. No forking, no flags buried in code.

3. **Zero app-specific imports.** The package imports nothing from any app or app-shared
   lib. Host specifics (permission model, schema, endpoints) are passed in. Enforced by
   `scripts/check-boundaries.mjs` (CI fails on an app-path import).

4. **Built artifact, not source-linked.** Ships `dist` (ESM + `.d.ts`) via `tsup`;
   `package.json` `exports` point at `dist`. Consumers install the built package
   (workspace, tarball, or registry) — cross-repo source-linking breaks `tsc`.

5. **Classified + drift-gated.** Declared in `taxonomy.yaml` (id, kind, path,
   primary/secondary planes, purpose); `scripts/check-taxonomy.mjs` fails if a package is
   unclassified or its paths drift. `pnpm check` runs boundaries + taxonomy + typecheck +
   tests.

## Configurability mechanics

- **Subset by import.** Where a sys has variants (auth methods, check kinds, probes), ship
  each as a side-effect-free, per-entry-point subpath export; the consumer imports only
  what it uses (tree-shaken) and lists them in config. `"sideEffects": false`.
- **Seams are interfaces, not implementations.** The package defines `interface`s for what
  it needs (a verifier, a resolver, a sink); adapters implement them. A second backend =
  a new adapter, same contract.
- **Generic engine + injected specifics.** An ops sys (validation, health, housekeeping)
  is a generic engine; the *what to check / where / thresholds* come from config. The
  engine never hard-codes a project's specifics.

## Cross-language reach (Qarar = TS, cadre-os = Python/bash)

A TS package can't be `import`ed by cadre-os's Python/bash runtime. So a sys that must run
in **both** is split along its real shared contract:

- **The config schema is the cross-language contract.** Publish a declarative schema
  (JSON Schema / YAML) for the sys's config — both runtimes validate against it. (cadre-os
  already does this: `config/schema/sys-*.schema.json`.)
- **The engine is one implementation per runtime.** TS projects consume the `@sys/*`
  engine directly; cadre-os either **invokes the engine as a CLI** (shell out to the Node
  binary) or keeps its own runner against the same schema.
- **Pick per sys:** TS-domain syses (e.g. `@sys/auth` — web/API auth) are TS-only and
  serve TS projects. Ops syses cadre-os actively runs (assay, warp, sentinel,
  groundskeeper, backup) need the schema-first + CLI/runner split if they must serve both.

## Atlas vs Canon — system boundary (do NOT merge them)

Two governance systems guard two *different kinds* of consistency. Keep them separate; composing them in a
runner is fine, collapsing them into one brain is not.

- **`@sys/atlas` — structural coupling (edges).** Registers couplings between artifacts; fails when a change
  to one wasn't propagated to its registered dependents. Diagnostic: *"you changed X but not Y."*
- **`@sys/canon` + `@eng/governance` — semantic validity (nodes).** Evaluates the current state of a governed
  object; fails when it isn't true / complete / permitted / launchable. Diagnostic: *"X is not valid /
  sellable / publishable / allowed."* Canon references other objects by **id (semantic refs)** — never
  Atlas-style file edges. It is **not** a second dependency graph.

**Rule:** do not encode file-coupling parity in Canon; do not encode business-state validity in Atlas. Both
may block deploy — for different reasons (gates: `atlas-parity`, `canon-validate`, `canon-completeness`,
`canon-claims`).

**North-star, deferred:** one "Governance Capability" — separate validators + one runner + one report. Build
the runner / `@eng/parity` / agent facade / console only after ≥2 real gates exist and the decision shape has
stabilized; until then keep the boundary as **folders + the existing contract** (`GovernanceDecision`,
`Severity` = critical/high/medium, `GatePolicy.{blocksDeploy,blocksLaunch}`, provenance `evidence{source,ref}`
= EvidenceRef — reuse these, don't fork). Atlas is *vendored* into consumers; Canon is its own repo — the
boundary holds across repos, they are not colocated. Full design: `docs/design/deploy-gates.md`.

## Versioning

Each package is independently versioned (SemVer) and carries a `CHANGELOG.md`. Because we vendor
via tarball (`file:vendor/<name>-<ver>.tgz`), **the version is part of the artifact name** — a
consumer pins an exact tarball, so a bump is a deliberate act with a paper trail.

- **Bump on every change that ships** to consumers (source, schema, contract, or exports). No bump
  for repo-internal edits that don't change `dist`.
- **SemVer, pre-1.0:** `patch` for fixes, `minor` for additive features, and breaking changes are
  allowed in `minor` while `0.x` — but the CHANGELOG must call the break out explicitly (see
  `@sys/assay` for the worked example: a closed-enum tightening flagged as breaking under a minor).
- **Every bump updates `CHANGELOG.md`** (newest entry on top) and the README's install snippet.
- **Ship the changelog:** `CHANGELOG.md` is in the package `files` whitelist so it travels in the
  tarball. Breaking changes also get a `MIGRATION.md` (again, `@sys/assay` is the template).
- The taxonomy `schema_version` (where a package emits one) bumps separately when the *contract*
  changes, independent of the package version.

## Checklist for a new `@sys/*`

- [ ] `packages/<name>/` with source-TS, `tsup` build, `"sideEffects": false`
- [ ] `defineX()` config (zod), isomorphic, no secrets
- [ ] seams as injected interfaces; no app imports (boundary guard passes)
- [ ] subpath exports for variants; root export stays side-effect-free
- [ ] entry in `taxonomy.yaml` (drift gate passes)
- [ ] tests for the engine + config; `pnpm check` green
- [ ] design docs in `packages/<name>/docs/`
- [ ] `CHANGELOG.md` seeded (`0.0.1`), in the `files` whitelist
- [ ] if cross-runtime: a config JSON Schema + a documented CLI entry
