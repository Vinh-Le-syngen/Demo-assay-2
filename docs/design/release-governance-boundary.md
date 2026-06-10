# ADR: the release-governance boundary (`@sys/release` vs `@sys/canon`)

**Status:** accepted · **Date:** 2026-06-08

## Context

`@sys/release` (the release attestor) and `@sys/canon` + `@eng/governance` (governed
business frameworks) are both governance-plane systems built on the same idea: records own
truth, engines decide over them. The question raised: does canon have value for the release
system — should release sets be stored as canon records and checked by `@eng/governance`?

## Decision

**Reuse the contract shape; do not merge the systems.**

1. **Reuse (done).** `@sys/release` adopts canon's governance *vocabulary*:
   - **Provenance** on `ReleaseSet` — canon's `provenanceFields`: a `status` lifecycle
     (`draft → approved → live → superseded`, the meaningful subset of canon's RowStatus),
     `owner`, `approved_by`, `evidence[{source, ref}]`, `last_reviewed`, `expires_at`, plus a
     freshness check. A release set's "which checks passed" is recorded as `evidence`, exactly
     as canon records why a row is trustworthy.
   - **Decision** — findings use the `GovernanceReason` severity vocabulary
     (`info | warning | blocker` + `derivesFrom`); validation folds them into a
     `ReleaseDecision` (`allow | deny | warn`) mirroring `@eng/governance`'s `GovernanceDecision`,
     with a release-domain subject (`release_set | adoption`).

2. **Do NOT merge (deferred).** Release sets are **not** registered as canon schemas, **not**
   stored as canon records, and **not** evaluated by `@eng/governance`. Reasons:
   - **Different domain.** Canon's content is *business/regulatory* truth (claims, service
     authority, strategy, pricing). A release set is an *engineering* artifact. Sharing a
     governance *shape* is not sharing a *domain* — collapsing "is `baseline@2026.06.0`
     internally consistent" into the same brain as "may we sell escrow in UAE" is a category
     error.
   - **Adoption is Atlas-flavored, not canon-flavored.** `sys.lock.json` vs tarball-metadata
     validation is *structural parity* ("the lock claims X but the artifact is Y") — the
     Atlas diagnostic, not canon's semantic-validity diagnostic. Release spans both flavors,
     which argues for its own system over absorption into either.
   - **The repo's own rule.** CONVENTIONS.md ("Atlas vs Canon") defers the unified governance
     runner until ≥2 real gates exist and the decision shape has stabilized. We have one real
     release and one gate. Premature unification is the trap the first `@sys/release` brief
     fell into.

## Mirror, not import

The provenance + decision types are **mirrored** in `@sys/release`, not imported from
`@sys/canon` / `@eng/governance`. Importing would couple the engineering attestor to the
business-governance packages, and `GovernanceSubject` is business-typed
(`claim | service | page | country | …`) — it doesn't fit a release. Field names match
deliberately so a future extraction of a **domain-free governance contract** (the deferred
`@eng/parity`-style north-star) is mechanical once a second real consumer justifies it.

## Consequences

- Release sets are first-class governed records (lifecycle, owner, approver, evidence,
  freshness) consistent with the rest of /sys — without coupling to business canon.
- Revisit storing release sets as canon records / running a release gate through
  `@eng/governance` only after a second release gate exists and the decision shape holds.
