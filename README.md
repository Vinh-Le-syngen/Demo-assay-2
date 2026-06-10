# sys

Reusable subsystems shared across apps — published under the `@sys/*` (a system that owns truth)
and `@eng/*` (a pure control-plane engine) scopes. Each package owns **one primary System plane**
and integrates the others via injected seams, so it stays small, strict, and hard to misuse.

### Two plane axes (don't conflate them)

Classification in this repo is by **System plane (P5)** — *how* a system is run: **Control, Data,
Observability, Governance, Recovery**. There is a second, orthogonal axis — **Business planes** —
*what part of the business* a capability serves: **Market, Offering, Interaction, Delivery,
Financial**. Only **business-capability** systems carry one: `billing` / `pay` → **Financial**,
`vault` → **Delivery**. Platform / cross-cutting systems (`auth`, `assay`, `atlas`, `canon`, …)
intentionally have none — they serve every Business plane, so a single home would mislead.

The `@sys/*` catalog classifies by **System plane** (the table below, and `taxonomy.yaml`'s
`primary_plane`); a business-capability package also records `business_planes`. Full doctrine —
both five-plane sets, the one-lens rule, and the per-package mapping — is in [`PLANES.md`](PLANES.md).

## Packages

26 subsystems, each owning one primary plane and integrating the others via injected seams.
`@sys/*` = a system that owns truth; `@eng/*` = a pure control-plane engine that decides.

| Package | Plane | What it is |
|---|---|---|
| [`@sys/auth`](packages/auth) | **Control** | Authentication & authorization — principal/session/tenant/permission context; decides what may proceed. |
| [`@sys/herald`](packages/herald) | **Control** | Notification decision + delivery — a policy engine (intent + recipient preferences) over injected channels. |
| [`@sys/pay`](packages/pay) | **Control** | Payment orchestration — turns "wants a service" into "payment confirmed → fulfilment allowed"; provider-agnostic intent + webhook capture. |
| [`@sys/vault`](packages/vault) | **Control** | Jurisdiction-aware document vault — versioned evidence + metadata + access decisions + audit + retention. |
| [`@sys/model-router`](packages/model-router) | **Control** | Selects the provider/model for an LLM request by capability, policy, sovereignty, fallback, and cost. |
| [`@sys/dialog`](packages/dialog) | **Control** | Orchestrates multi-party dialog modes (debate/council/panel) over retrieval + model-routing adapters. |
| [`@sys/chat`](packages/chat) | **Control** | Chat session manager — pure session lifecycle and configurable turn-ordering policy over an injectable content-policy seam. |
| [`@eng/governance`](packages/governance) | **Control** | Governance engine — pure deciders over `@sys/canon` records + injected policy (restricted claims, gating). |
| [`@eng/workflow`](packages/workflow) | **Control** | Workflow engine — the WorkflowDefinition contract (stages, gates, transitions); advances case state. |
| [`@sys/canon`](packages/canon) | **Data** | Governed-framework RECORDS — strategy, regulatory operating envelope, positioning, product, content. |
| [`@sys/rag`](packages/rag) | **Data** | Grounded context packs with citations for AI workflows — thin TS contract + validation + HTTP client. |
| [`@sys/sentinel`](packages/sentinel) | **Observability** | Health monitoring — runs injected dependency probes, derives overall health, decides alert-worthiness. |
| [`@sys/groundskeeper`](packages/groundskeeper) | **Observability** | Operational-hygiene detectors — run detectors → summarize → alert decision (aging/expiry). |
| [`@sys/assay`](packages/assay) | **Governance** | Test registry + canonical taxonomy + quality gates — every test registered, none stale, classified into the sys-owned taxonomy by the right author, with per-area coverage floors. |
| [`@sys/warp`](packages/warp) | **Governance** | Config cross-validation harness — projects register named checks that return error lists. |
| [`@sys/atlas`](packages/atlas) | **Governance** | Dependency-graph impact analysis + propagation guard over a declared cross-file graph. |
| [`@sys/checkpoint`](packages/checkpoint) | **Governance** | Git-safety gate harness — named policy gates (protected branch / author / clean tree) over git state. |
| [`@sys/consent`](packages/consent) | **Governance** | Cookie/script consent — category vocabulary + a pure ALLOW/DENY "may this technology run?" engine. |
| [`@sys/gatekeeper`](packages/gatekeeper) | **Governance** | Promotion gate — a pure ALLOW/DENY/REVIEW verdict + staging-first promotion policy. |
| [`@sys/billing`](packages/billing) | **Governance** | Commercial-document subsystem — invoices + credit notes from policy-governed payment events. |
| [`@sys/backup`](packages/backup) | **Recovery** | Incremental backup — pure diff / manifest-checksum / freshness primitives + source→sink orchestration. |
| [`@sys/release`](packages/release) | **Governance** | Release attestor — calendar-versioned release sets + product adoption (`sys.lock.json`) validation incl. vendored-tarball metadata. Reads versions Changesets produced. |
| [`@sys/warden`](packages/warden) | **Observability** | Worktree↔agent ownership for repos run by many parallel agents — reuses sentinel (liveness) + groundskeeper (reclaim) + an atomic mkdir claim lease. |
| [`@sys/errors`](packages/errors) | **Governance** | Error-code registry + classification + declarative alert routing — `DOMAIN.AREA.CONDITION`, vocabulary as data, authoritative retryable; emits via `@sys/telemetry`. |
| [`@sys/telemetry`](packages/telemetry) | **Observability** | The observability event spine — pure event model + correlation + redaction + emit over an injected sink; never decides transport. |
| [`@sys/reporting`](packages/reporting) | **Observability** | Declarative report definitions + pure aggregation + cron matcher + CSV/JSON export over injected DataSource/Delivery. |
| [`@sys/secrets`](packages/secrets) | **Control** | Secret-reference resolver — references in code, values never; keychain→env→fail over a SecretRefs manifest; snapshot-safe. |

## Membership — what belongs here

`/sys` holds **reusable, cross-project subsystems only**. The canonical rule (the membership
test, the per-package origin + `canonical`/`thin-client` classification, and the explicit
exclusions — cadre-os internals and consumer domain packages) lives in
[`MEMBERSHIP.md`](MEMBERSHIP.md). `taxonomy.yaml` is the machine-checked classification;
consumer registries record *consumption*, not membership.

## Architecture: physical tree by name, classification by plane

The folder tree is organized by **subsystem name** (`packages/auth`), never by plane —
real subsystems are cross-plane (one primary plane, responsibilities in others), so a
plane-first tree would mislead. The plane mapping lives in [`taxonomy.yaml`](taxonomy.yaml),
the canonical classification layer: each entity declares its `kind`, `path`,
`primary_plane`, `secondary_planes`, `purpose`, and **provenance** (`owner`, `last_reviewed`,
`status` — active/experimental/deprecated). e.g. `sys-auth` → primary **control**, active.

`taxonomy.yaml` is the **package-catalog canon** (the `@sys/canon` pattern applied to the repo's
own packages: a registry of truth + provenance + gates with a severity policy). It is
**hand-authored but machine-enforced** by `scripts/check-taxonomy.mjs`:
- **Blocks** (CI fails): schema/planes/kinds valid, no duplicate ids/paths, every entity/module
  path exists, every `packages/*` classified, complete provenance (valid `status`/date), README present.
- **Warns** (nudges, non-fatal): missing CHANGELOG, `0.0.0` version, `owner: unassigned`, stale `last_reviewed`.

It classifies, orients, and governs hygiene — it does NOT duplicate package manifests or build config.

## Conventions

- One package per reusable subsystem under `packages/`, classified in `taxonomy.yaml`.
- A package imports **nothing app-specific** — host concerns (permission model, event
  sink, backend) are injected via config. Enforced by `scripts/check-boundaries.mjs`.
- Each package builds to `dist` (ESM + `.d.ts`); consumers install the built artifact.
- `pnpm check` runs boundaries + taxonomy + typecheck + tests across the repo.

## Branching & promotion

Two protected branches model the production boundary:

- **`main`** — production / released. Promoted **only by the owner** (Sinuhe).
  Protected: PR + 1 approval + code-owner review, no force-push or delete.
- **`staging`** — integration / pre-prod. Where the team's work lands.
  Protected: PR + 1 approval, no force-push or delete.

Day-to-day: branch from `staging` (`feature/*`, `fix/*`, `chore/*`, `docs/*`),
open a PR **into `staging`**. Never PR directly into `main`. The owner
periodically opens a `staging → main` promotion PR to cut a release.

Full protocol — access model, daily flow, promotion, hotfixes — in
[`docs/GOVERNANCE.md`](docs/GOVERNANCE.md).

## Origin

Extracted from Qarar (2026-06-03). Per-package design docs live with their package
(e.g. `packages/auth/docs/` — spec, proposal, current-state).
