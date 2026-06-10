# @sys/gatekeeper

Promotion gate: a pure ALLOW/DENY/REVIEW verdict over the facts of a proposed branch promotion, plus a canonical staging-first policy.

**Plane:** governance (primary), control  ·  part of the `@sys/*` reusable-subsystem monorepo.

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@sys/gatekeeper": "file:vendor/sys-gatekeeper-0.0.1.tgz"
```

## API

- `promotionVerdict(input, policy?): PromotionVerdict` — decide ALLOW / DENY / REVIEW from facts (allowed edge, tests green, gate violations, risk, human approval), with reasons.
- `stagingFirstPolicy(opts?): PromotionPolicy` — the canonical `feature → staging → main` policy (production always holds for a human; risky/critical require review).
- `PromotionInput`, `PromotionPolicy`, `PromotionEdge`, `PromotionVerdict`, `Decision`, `Risk` (types) — the input facts, policy shape, and verdict.

## Usage

```ts
import { promotionVerdict, stagingFirstPolicy } from '@sys/gatekeeper'

const verdict = promotionVerdict(
  { from: 'staging', to: 'main', testsGreen: true, risk: 'normal' },
  stagingFirstPolicy(),
)
// verdict.decision === 'REVIEW'  (main requires human approval)
process.exit(verdict.decision === 'ALLOW' ? 0 : verdict.decision === 'DENY' ? 1 : 2)
```

## Extend via

Policy — the allowed edges, human-approval targets, and review-risk levels (the caller supplies tests/gate facts).

## CLI

```
sys-gatekeeper
```
