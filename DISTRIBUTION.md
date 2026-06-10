# Distribution — GitHub Packages (@sys scope)

`@sys/*` publishes to **GitHub Packages** under a `sys` GitHub org (free, private). The
`sys` org name is available. Consumers (Qarar, mongu, …) install with a one-line `.npmrc`.

> **Scope policy (decided):** only **`@sys/*` is registry-published**. The two `@eng/*`
> packages (`@eng/governance`, `@eng/workflow`) are **vendored-only** — they are still
> versioned, changelogged, and tagged by Changesets and packed as tarballs, but never pushed
> to a registry. Reason: GitHub Packages ties a scope to an org of the same name, so `@eng/*`
> would need a separate `eng` org; not worth it for two gov-tooling engines that consumers
> already vendor. `release:publish` therefore filters to `@sys/*`; `release:pack` packs all 21.

## Release flow (versioning is automated — read this first)

Versioning is owned by **Changesets**, not by hand:

```sh
pnpm changeset        # declare intent per change (package + bump kind + note)
pnpm version          # = changeset version: bumps changed packages AND their dependents,
                      #   rewrites workspace:* deps, writes CHANGELOGs + tags
pnpm release:pack     # check + build + pack ALL 21 tarballs into .releases/artifacts/ (interim bridge)
pnpm release:publish  # check + build + publish @sys/* only (once the sys org/PAT exist); @eng/* stay vendored
```

`changeset version` does the thing the old manual runbook did by hand: a `workspace:*`
internal dep (e.g. `@eng/governance` → `@sys/canon`) becomes a **real version range in the
packed/published artifact**. This **supersedes the manual source-side pin** (hand-editing
`workspace:*` → `1.0.0` before packing).

> **It does NOT remove the consumer-side `pnpm.overrides` in the interim.** A rewritten range
> like `@sys/canon: 1.0.0` is a *registry* spec — until `@sys/canon` is actually published, a
> vendored consumer can't resolve that transitive dep from a tarball (`pnpm install` →
> `ERR_PNPM_FETCH_404`, observed in Qarar). So a vendored consumer of `@eng/governance` still
> needs `pnpm.overrides: { "@sys/canon": "file:vendor/sys-canon-<ver>.tgz" }` until canon is on
> the registry. Once `@sys/*` is registry-published, the override is removable. See the
> inter-package note below.

After a release, snapshot + attest with **`@sys/release`** (the attestor — it reads the
versions Changesets produced, it does not compute them):

```sh
pnpm release:set                      # write .releases/sets/baseline-<calver>.json
node packages/release/dist/cli.js set validate   # drift gate (also runs inside pnpm check)
```

Consumers validate their adoption with `sys-release adoption validate --lock sys.lock.json`
— which catches a `file:vendor/foo-1.1.0.tgz` whose tarball metadata is really `0.0.1`. How
each consumer gets the CLI (Qarar vendors it + a CI gate; cadre-os is schema-first, **no
tarball**) is documented in `packages/release/README.md` → "Consuming @sys/release".

## One-time setup (you — needs account actions I can't do)

1. **Create the free `sys` org**: https://github.com/account/organizations/new → Free plan
   → name it `sys`. (This is why the scope is `@sys`; GitHub Packages ties scope to owner.)
2. **Create a PAT (classic)** with scopes `write:packages`, `read:packages`, `repo`:
   https://github.com/settings/tokens/new — copy the token.

## Publish (run once per release)

```sh
cd ~/projects/sys
export NODE_AUTH_TOKEN=<your-PAT>
pnpm release:publish  # = pnpm check && pnpm -r build && pnpm --filter "@sys/*" publish --no-git-checks
```

`.npmrc` (committed) routes **`@sys`** → `npm.pkg.github.com` and reads `${NODE_AUTH_TOKEN}`
for auth. `release:publish` filters to `@sys/*`, so the two `@eng/*` packages are never
pushed (they have no registry route by design — vendored-only). First publish creates the
`@sys/*` packages in the org (private). The legacy `pnpm release` script (publishes *all*
scopes via `pnpm -r publish`) is kept only as a fallback — prefer `release:publish`.

## Host the source (optional but recommended)

```sh
gh repo create sys/sys --private --source ~/projects/sys --push
```

## Consuming `@sys/*` in another repo (e.g. Qarar)

Add `.npmrc` to the consumer repo:

```
@sys:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then `export GITHUB_TOKEN=<PAT with read:packages>` and:

```sh
pnpm add @sys/auth @sys/assay @sys/warp @sys/sentinel @sys/groundskeeper @sys/backup
```

In CI/Vercel: set `GITHUB_TOKEN` (or a dedicated `read:packages` PAT) as an env var so the
build can resolve `@sys/*`. This replaces the `vendor/sys-auth-0.0.1.tgz` tarball bridge.

## Adopting a sys into a venture — the vendor runbook (CURRENT process)

Until GitHub Packages is live, ventures consume `@sys/*` / `@eng/*` by **vendoring** (tarball bridge).
This is the standard, repeatable order — follow it for any sys, any venture.

### Level A — adopt any sys (generic)
1. **Build + pack** in the source repo: `pnpm --filter <pkg> build && pnpm --filter <pkg> pack` → a
   versioned tarball (e.g. `sys-canon-0.0.1.tgz`). Pack every package being adopted.
2. **Drop** the tarball(s) into the consumer's `vendor/`.
3. **Declare** as `file:vendor/<name>-<ver>.tgz` deps in the *owning* package's `package.json`
   (runtime → app/package deps; a CI/build-only gate → **devDependencies** of the tooling package).
4. **Register** in the consumer's `systems/system-registry.yaml` (id, npm name, plane, status,
   `vendored:` path, `consumed_by:`, purpose).
5. **Install + smoke-test** (`pnpm install`; run the CLI or import once to confirm it resolves).

> **Inter-package deps (PARTLY superseded by Changesets):** if a vendored package depends on
> *another* vendored package via `workspace:*` (e.g. `@eng/governance` → `@sys/canon`), the
> two-part fix used to be: (a) pin the dep to a real version before packing, and (b) add a
> consumer `pnpm.overrides` entry. **Part (a) is now automatic** — `changeset version` rewrites
> `workspace:*` to a real range in the packed artifact, so never hand-edit the source dep.
> **Part (b) is still required in the interim**, and is NOT optional: the rewritten range
> (`@sys/canon: 1.0.0`) is a *registry* spec, so until `@sys/canon` is published a vendored
> consumer still hits `ERR_PNPM_FETCH_404` and needs
> `"pnpm": { "overrides": { "@sys/canon": "file:vendor/sys-canon-1.0.0.tgz" } }` to force the
> transitive resolution to the local tarball. (Observed in Qarar; fixed exactly this way.)
> Drop the override only once `@sys/canon` is on the registry.

### Level B — adopt **canon** specifically (engine + content + gate)
Canon is special: two things flow from `sys`, to two places.
1. **Vendor the engine** (Level A) for `@sys/canon` + `@eng/governance` → home: `packages/qarar-ops`
   **devDependencies** (the governance gate is CI/build tooling, not app runtime). *(not `@eng/workflow` —
   the venture may already have its own workflow engine.)*
2. **Land the content** — the registries are *venture-specific* and live in the venture
   (`docs/compliance/registries/*.yaml`, scaffolded by `sys-canon init`, then filled). Merge the branch
   that holds them so the engine has something to check.
3. **Wire the gate** — a `gov-check` script running `sys-canon validate | scan | link` against the
   registries + public surfaces; then into CI / `deploy-staging` as the `canon-validate` / `canon-claims`
   gates (`blocksDeploy`).
4. **Then consume** — build downstream artifacts (messaging house, web copy) *last*: their `cap.*` /
   approved-claim traces only become **enforceable** once 1–3 are done. Build them earlier and the traces
   are decorative.

> Order discipline: engine → content → gate → consume. Never build a governed downstream artifact before
> the gate that enforces it exists.

## After publishing — retire the Qarar duplicates

Once `@sys/*` is on the registry, swap Qarar's copies for the packages:
`scripts/assay-check.mjs` → `@sys/assay` CLI; `packages/shared/src/warp.ts` → `@sys/warp`;
`apps/api/src/lib/health.ts` → `@sys/sentinel`; `packages/shared/src/housekeeping.ts` →
`@sys/groundskeeper`; `apps/api/src/lib/backup.ts` → `@sys/backup`; and replace the
`@sys/auth` tarball dep with `@sys/auth` from the registry.
