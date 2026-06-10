# Planes — the two axes

Every module is described by **two orthogonal five-plane axes**. Use **one lens per task**: *"which
part of the business?"* → Business Planes; *"how is the system built/operated?"* → System Planes.
Do not conflate them — the word "plane" alone is ambiguous.

| Axis | The five | Question answered |
|---|---|---|
| **System Planes (P5)** | Control · Data · Observability · Governance · Recovery | *How* is the system built and operated? |
| **Business Planes** | Market · Offering · Interaction · Delivery · Financial | *What part of the business* does it serve? |

Canonical upstream: **Qarar `docs/architecture/planes.md`** (the originating doctrine). This file
records the subset that governs `@sys/*` / `@eng/*` classification in this repo.

## System Planes (P5) — how a system runs

- **Control** — principal/session/tenant/permission context; decides what proceeds.
- **Data** — records, schemas, storage, truth — the **systems** (`@sys/*`).
- **Observability** — structured telemetry; emits, never decides.
- **Governance** — policy, permission model, invariants, the stable contract.
- **Recovery** — expiry, refresh/retry, forced re-auth, degraded mode.

A package owns **one primary System plane** and integrates the others via injected seams.
`taxonomy.yaml` records this as `primary_plane` + `secondary_planes`.

## Business Planes — what part of the business

- **Market** — segments, GTM, channels, pricing strategy, brand.
- **Offering** — products, services, packages, the catalog.
- **Interaction** — customer journeys, touchpoints, support, comms (surfaces: web/mobile/portals).
- **Delivery** — fulfilment, cases, vault, service execution.
- **Financial** — billing, payments, margin, reporting.

## Who carries a Business plane — and who doesn't

> Only **business-capability** modules carry a primary Business Plane.
> Platform / cross-cutting modules do not — they serve *many* Business Planes, so forcing one
> would mislead.

- **Systems** (`@sys/*`) — own long-lived truth; mostly **P5.Data**.
- **Engines** (`@eng/*`) — compute decisions from system data + policy; mostly **P5.Control**.
- **Business engine/system** — serves *one* Business Plane; has a `business_plane` home.
- **Platform engine/system** — a technical capability serving *many* Business Planes; **no home**.

## `@sys/*` catalog → Business plane (this repo)

Sourced from Qarar `planes.md §7` (the Business × System matrix). Recorded in `taxonomy.yaml` via the
optional per-entity `business_planes` field; absence is intentional for platform modules.

| Package | Business Plane | Why |
|---|---|---|
| `@sys/billing` | **Financial** | invoices, credit notes, reporting |
| `@sys/pay` | **Financial** | payments + payment orchestration |
| `@sys/vault` | **Delivery** | document vault / cases / service execution |
| `auth`, `assay`, `atlas`, `canon`, `checkpoint`, `gatekeeper`, `governance`, `groundskeeper`, `sentinel`, `warp`, `workflow`, `consent`, `herald`, `dialog`, `model-router`, `rag`, `backup` | **none** (platform / cross-cutting) | serve many Business Planes — no single home |

Not yet in `/sys`: `catalog` → Offering, `case` → Delivery (Qarar capabilities pending extraction).

## How it's enforced

`taxonomy.yaml` is the package-catalog canon: each entity declares its System plane (`primary_plane`
/ `secondary_planes`) and, where applicable, its `business_planes`. `scripts/check-taxonomy.mjs`
validates both axes against the declared vocabularies (`planes` and `business_planes`) — an unknown
value on either axis blocks CI.
