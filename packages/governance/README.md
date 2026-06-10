# @eng/governance

Control-plane **governance engine**: pure deciders that compute decisions from [`@sys/canon`](../canon) records + injected policy (restricted-claim scanning, claim→capability linking, commercial sellability, SEO gates). Owns no canonical truth — systems own truth, this engine only decides.

**Plane:** control  ·  `@eng/*` (pure control-plane engine)  ·  part of the `@sys/*` reusable-subsystem monorepo.

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@eng/governance": "file:vendor/eng-governance-0.0.1.tgz"
```

## API

- `defineGovernance(config?): Governance` — validate/normalize config and return the configured decider surface.
- `scanClaims(files, restricted, opts?): ClaimViolation[]` — flag restricted/unapproved claims in content files.
- `linkClaims(claims, capabilities, opts?): ClaimLinkIssue[]` — approved claims with no backing capability (or a disallowed status).
- `commerciallySellable(entry): boolean` / `unresolvedServiceAuthority(services): string[]` — service-authority deciders.
- **SEO gates** (each `→ SeoIssue[]`): `pageAuthorityGate`, `cannibalizationGate`, `noindexGate`, `freshnessGate`, `seoRulesGate`.
- Types: `Governance`, `GovernanceConfig`, `GovernanceDecision` / `Kind` / `Reason` / `Subject`, `ClaimViolation`, `ClaimLinkIssue`, `ContentFile`, `PageMeta`, `SeoIssue`, `ScanOptions`, `SCAFFOLD`.

Ships a `sys-canon` CLI (`bin`) for running the deciders over canon records.

## Usage

```ts
import { defineGovernance, scanClaims, freshnessGate } from '@eng/governance'

const gov = defineGovernance()
const violations = scanClaims(contentFiles, restrictedClaims)   // [] → clean
const stale = freshnessGate(pages, { now: Date.now(), maxAgeDays: 180 })
```

## Extend via

`@sys/canon` records (the truth) + injected policy (restricted claims, capability statuses, SEO rules). The engine decides; it stores nothing.
