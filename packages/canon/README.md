# @sys/canon

Governance-plane engine for **governed frameworks** — strategy, the regulatory operating envelope,
positioning, product, content, pricing. A governed framework is a *canon* (source of truth) +
machine-checkable *config/registries* + *gates*. This package owns the **reusable engine**; each venture
(Qarar, mongu, …) supplies its own content.

## What it owns (and what it doesn't)
- **Owns (Governance plane):** the config **schemas** (the cross-language contract), the **gate decisions**
  (e.g. the restricted-claims scan) as **pure functions**, and the `defineCanon()` composition root.
- **Injected by the consumer:** the actual content — a venture's `choices.yaml`, approved/restricted claims,
  service-authority. Zero app-specific imports; pure core (no IO) like `@sys/gatekeeper`.

## Use it (TS)
```ts
import { defineCanon } from '@sys/canon'

const canon = defineCanon({
  restricted: loadYaml('docs/compliance/registries/restricted-claims.yaml'),
  serviceAuthority: loadYaml('docs/compliance/registries/service-authority.yaml'),
})

const violations = canon.scan(publicContentFiles)   // restricted-claims gate (legal pages auto-excluded)
const todo = canon.unresolvedServiceAuthority()      // services still marked VERIFY
```

## Use it (cross-language — cadre-os Python/bash shells out to the CLI)
```sh
# fail CI if any restricted phrase appears in public/marketing surfaces
sys-canon scan --registry docs/compliance/registries/restricted-claims.yaml \
               --paths apps/web/src .agent-work/landing

# validate a config file against its schema
sys-canon validate --schema choices --file docs/strategy/choices.yaml
```
Exit codes: `0` ok · `1` violations/invalid · `2` usage/IO error.

## Schemas (named)
`restrictedClaims` · `approvedClaims` · `choices` · `serviceAuthority` — see `src/core.ts`. These are the
cross-language contract; both TS and (via JSON Schema export, roadmap) Python/bash validate the same shapes.

## Plane
Primary: **governance** (policy + the stable contract). Secondary: control (the CLI decision entry).
Reference sibling: `@sys/gatekeeper` (pure verdict + CLI).

## Beyond the blacklist
- **Provenance** on every row (`status, derives_from, evidence, owner, last_reviewed`) — config as operational law.
- **Claim → capability linker** (`linkClaims`): an approved claim must map to a **live/assisted** capability,
  catching soft overclaim ("end to end") a phrase blacklist misses. `sys-canon link`.
- **Operational readiness** on service authority (`commerciallySellable`): "permitted" = legally permitted
  AND operationally deliverable (legal/playbook/docs ready, failure-modes not missing).
- **Severity-based gate policy** (`GATE_POLICY`): each gate declares `blocksDeploy` / `blocksLaunch`.
- **SEO governance** (`./seo`): `keywordMap` / `pageRegistry` / `seoRules` schemas + pure gates
  (page-authority, cannibalization, noindex, freshness, seo-rules). SEO captures demand but cannot invent claims.

## Cross-language contract (JSON Schema)
The zod schemas emit JSON Schema (`toJsonSchema(name)`, `allJsonSchemas()`) so non-TS runtimes
(cadre-os Python/bash) validate against the **same** shapes. Write them out with the CLI:
```sh
sys-canon schema --out config/schema           # all schemas → config/schema/<name>.schema.json
sys-canon schema --name serviceAuthority        # one schema → stdout
```

## Roadmap
- `init` scaffold: lay down the compressed 4-domain governance spine with provenance-bearing templates.
- More gates: strategy drift (positioning-constraints vs copy), service-launch, derivation-citation.
