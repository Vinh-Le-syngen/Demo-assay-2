# @sys/release — design

## Why an attestor, not a release engine

The hard monorepo problems — version bumps, **dependent auto-bumps**, `workspace:*` → real
range rewriting, changelogs, tags — are owned by **Changesets** (producer side). Rebuilding
them is the trap the first `@sys/release` brief fell into: it duplicated Changesets and, the
tell, omitted the two things that are the whole reason a monorepo needs a release tool
(range rewrite + dependent bumps).

`@sys/release` builds only what Changesets does **not**:

1. **Release set** — a coherent, immutable, calendar-versioned bundle of package + contract
   versions a product can pin to as a unit. Effectively a governed record of "this set of
   versions was built and checked together."
2. **Adoption validation** — consumer-side. A product's `sys.lock.json` declares what it
   adopts; the validator diffs the claim against declared deps **and vendored tarball
   metadata**. Nothing off-the-shelf does this, and it catches the exact failure the interim
   vendoring bridge invites: a `file:vendor/foo-1.1.0.tgz` whose tarball is really `0.0.1`.

It **reads** versions Changesets produced; it never recomputes them. That boundary is what
keeps it from regrowing into a Changesets clone.

## Shape

Standard `@sys/*` anatomy: pure core (`release-set`, `adoption`, `workspace`, `schemas`)
over an injected `ReleaseHost` (file IO + tarball-manifest read), so the engine is exercised
in memory with no temp dirs. `node-host` is the `node:fs` seam the CLI uses; the tarball
reader shells out to `tar -xOf <tgz> package/package.json`. Governance plane, Data secondary.

## Flow

```
Changesets:  pnpm changeset → pnpm version → pnpm release:pack   (versions, ranges, changelogs, tarballs)
@sys/release: sys-release set create --write                     (snapshot the bundle)
              sys-release set validate                           (drift gate, wired into pnpm check)
   product:   sys-release adoption validate --lock sys.lock.json (attest the consumer's claim)
```

## Deliberately out of scope (forever)

Bump computation, changelog generation, publish/GitHub-release orchestration, dependency-graph
propagation, dashboards. Those are Changesets' or CI's job. See `../../../DISTRIBUTION.md`.

## Closed (0.0.2)

- **Multi-manifest discovery** — `adoption validate` scans every workspace manifest (root +
  `apps/*` + `packages/*`); `file:` specs resolve relative to the declaring manifest's dir.
- **Transitive resolvability** — each vendored tarball's `@sys/@eng` deps are checked against
  the consumer's declared deps + lock + `pnpm.overrides`; an unresolvable one raises
  `tarball_dep_unsatisfiable` (the `ERR_PNPM_FETCH_404` case, caught at validate time).

## Open follow-ups

- Generate the JSON Schemas under `schema/` from the zod schemas at build (currently
  hand-mirrored; a test asserts zod accepts the examples).
- Optional integrations once ≥2 real gates exist: `@sys/gatekeeper` (promote a set),
  `@sys/checkpoint` (clean-tree pre-release), `@sys/canon` (store sets as governed records).
