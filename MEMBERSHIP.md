# `/sys` membership — what belongs here, what doesn't, and why

`/sys` is the **source of truth for reusable, cross-project subsystems** (`@sys/*` systems
that own truth, `@eng/*` engines that decide). It is *not* a dumping ground for every
subsystem any one app happens to have. This document is the canonical rule; `taxonomy.yaml`
is the machine-checked classification; consumer registries (e.g. qarar's
`systems/system-registry.yaml`) record *consumption*, not membership.

## The membership test

A subsystem belongs in `/sys` only if **all** of these hold:

1. **Reusable** — useful to ≥2 projects (today: qarar, cadre-os, mongu, …), not one app's domain.
2. **Host-agnostic** — imports nothing app-specific; permission model, event sink, storage,
   provider, vocabulary are **injected as seams** (enforced by `scripts/check-boundaries.mjs`).
3. **One primary plane** — owns exactly one of Control / Data / Observability / Governance /
   Recovery, classified in `taxonomy.yaml`.
4. **Buildable + checkable in isolation** — builds to `dist` (ESM + `.d.ts`), passes `pnpm check`.

If a subsystem fails any of these, it stays in the consumer (or in cadre-os) — it does **not**
move here.

## Canonical members (26)

`membership: canonical` = a full reusable package implemented here.
`membership: thin-client` = a TS contract + HTTP client only; the **engine runs elsewhere**
(currently cadre-os). Thin clients are borderline and tracked explicitly so they aren't
mistaken for self-contained systems.

| Package | Plane | Origin | Membership |
|---|---|---|---|
| `@sys/auth` | Control | qarar | canonical |
| `@sys/herald` | Control | qarar | canonical |
| `@sys/pay` | Control | qarar | canonical |
| `@sys/vault` | Control | qarar | canonical |
| `@eng/governance` | Control | qarar | canonical |
| `@eng/workflow` | Control | qarar | canonical |
| `@sys/model-router` | Control | cadre-os | **thin-client** (engine in cadre-os) |
| `@sys/dialog` | Control | cadre-os | **thin-client** (engine in cadre-os) |
| `@sys/canon` | Data | qarar | canonical |
| `@sys/rag` | Data | cadre-os | **thin-client** (Python engine in cadre-os) |
| `@sys/sentinel` | Observability | cadre-os | canonical |
| `@sys/groundskeeper` | Observability | qarar | canonical |
| `@sys/assay` | Governance | qarar | canonical |
| `@sys/warp` | Governance | cadre-os | canonical |
| `@sys/atlas` | Governance | cadre-os | canonical |
| `@sys/checkpoint` | Governance | cadre-os | canonical |
| `@sys/consent` | Governance | qarar | canonical |
| `@sys/gatekeeper` | Governance | cadre-os | canonical |
| `@sys/billing` | Governance | qarar | canonical |
| `@sys/backup` | Recovery | qarar | canonical |
| `@sys/release` | Governance | sys | canonical |
| `@sys/warden` | Observability | cadre-os | canonical |
| `@sys/errors` | Governance | cadre-os | canonical |
| `@sys/telemetry` | Observability | cadre-os | canonical |
| `@sys/reporting` | Observability | cadre-os | canonical |
| `@sys/secrets` | Control | cadre-os | canonical |

`/sys` is a **mix** of cadre-os-origin and qarar-origin subsystems — not "extracted cadre-os."
A few concepts (e.g. health monitoring, test registry, hygiene) existed in both and were
**unified here**; `origin` records the implementation that became the package.

## Explicitly NOT in `/sys`

**cadre-os internals** — agent-orchestration / build-system machinery, single-host, not
reusable. They stay in cadre-os:

> registrar, docket, shuttle, loom, rectifier, agentbus, event-mesh, mnemos, envoy, outcomes,
> connect, alerts, nightshift (retired), standards (doctrine), ci (covered per-project)

> **Mechanism vs configuration (ADR-0126, cadre-os).** `errors`, `telemetry`, and `reporting`
> graduated to `/sys` (and `secrets` from SYS-WARP) because their reusable *engine* separates
> cleanly from cadre-os's *data*: error codes, event subjects, alert-routing tables, and report
> definitions stay in cadre-os as **injected configuration** — only the engine lives here. The
> same boundary keeps the `event-mesh` and `alerts` *modules* in cadre-os (subjects, sinks,
> channel adapters, `triggers.yaml`) even though their engines are `@sys/telemetry` and
> `@sys/herald`. **No `/sys` package may bake in consumer vocabulary** — codes, subjects, routing,
> and report defs are always injected. This refines membership test #2 (host-agnostic).

**Consumer domain packages** — app-specific, stay in the app:

> qarar: `shared`, `eng`, `catalog`, `qarar-ops`, `blueprint`

A subsystem in a consumer that *passes the membership test* is a **promotion candidate** — it
is extracted here, then the consumer vendors it back. Until then it is not a `/sys` member.

## Promotion / demotion process

- **Promote:** implement (or extract) the package under `packages/<name>/`, classify it in
  `taxonomy.yaml` (incl. `origin` + `membership`), pass `pnpm check`, **push**, then publish so
  consumers can adopt it.
- **Demote / exclude:** if it turns out app-specific, remove it here and record the reason in the
  "Explicitly NOT in `/sys`" list above (mirrors qarar's `excluded:` rationale).

## Distribution & durability (the rule that keeps this stable)

- **Intended:** GitHub Packages (`@sys` scope) — see `DISTRIBUTION.md`. Deferred until the `sys`
  org + PAT exist. **Only `@sys/*` is registry-published**; the two `@eng/*` engines are
  **vendored-only** (still versioned/tagged, never pushed — they'd need a separate `eng` org).
- **Interim:** consumers **vendor built tarballs** (`vendor/sys-*.tgz` via `file:` deps). A
  consumer's vendored set is a *snapshot* and may lag `/sys`.
- **Non-negotiable:** **`/sys` is pushed to GitHub after every change.** The source of truth must
  live on the remote, not only in a local worktree. (This document exists because that rule had
  drifted — local `/sys` was 14 packages ahead of the remote.)
