# Design — pre-deploy gate bundles

> Status: **design** (no engine changes). Defines how Canon blocks a deploy until a declared set of
> gates pass — covering not just *truth* (claims/capabilities) but *completeness* (translations) and
> *function* (mobile, links). Example config: `examples/qarar-deploy-gates.yaml`.

## The idea

One declarative file lists the gates that must pass before a deploy proceeds, in two stages:

- **`staging`** — blocks *deploy to staging*.
- **`production`** — blocks *promote staging → production* (launch); inherits `staging`.

Each gate declares whether it `blocks: deploy | launch | none(warn)` and a `severity`. The deploy
script asks the bundle for a verdict; if any deploy-blocking gate fails, the deploy stops with the
failures listed in plain English. This is the same "refuse until reality agrees" discipline already
applied to marketing claims — now applied to the whole release.

## Two kinds of gate (the load-bearing distinction)

| | **governance** | **functional** |
|---|---|---|
| Question | "is it true / allowed?" | "is it complete / working?" |
| Examples | schema valid · no restricted phrases · claim→live capability · page-authority · service-authority · jurisdiction · freshness | build passes · all pages translated · mobile renders · no dead links |
| Who computes the verdict | the **pure engine** (`@eng/governance`), deterministically, no IO | an **external check** — a CI script or an agent — that does real work and reports back |
| Why split | the engine must stay pure (no browsers, no network, no file mutation) | rendering/crawling/translating are side-effects; they belong outside |

**The rule:** the engine *consumes verdicts*; it never performs side-effects. A functional gate's runner
(agent or script) does the work — render a phone-sized browser, crawl links, translate pages — and returns
a verdict in the standard decision shape. The bundle treats both kinds identically once it has a verdict.

## How a functional gate reports back

Every gate — governance or functional — resolves to the existing `GovernanceDecision` contract:

```
{ gate, status: allow | deny | warn | requires_review, severity, blocks, findings: [...] }
```

So a mobile-render agent that finds an overflow returns `{ gate: 'mobile-render', status: 'deny',
severity: 'high', blocks: 'deploy', findings: ['/contact overflows at 360px'] }`. The bundle aggregates
all verdicts and decides go/no-go. Nothing new in the contract; functional gates just populate it.

## Worked mapping (your three asks)

- **Translate all pages → all supported locales.** `i18n-coverage` (functional, agent): asserts every
  route has a non-stale translation for every `supported_locale`, then **re-runs `claim-scan` per
  locale** so a translation can't smuggle in a restricted phrase. Translating is the agent's job; the
  gate asserts coverage + honesty before staging.
- **Mobile version works.** `mobile-render` (functional, agent): renders each route at phone viewports,
  asserts no overflow / tap-target size / no clipped CTAs.
- **All links work.** `link-integrity` (functional, script): crawls every link, fails on any dead one.

All three are `blocks: deploy` in the `staging` bundle → staging is refused until they're green.

## What already exists vs. what this needs

- **Exists:** the gate *spine*. `@sys/canon`'s `GATE_POLICY` already tags each gate `blocksDeploy` /
  `blocksLaunch`; the decision contract already has `allow/deny/warn/requires_review`; the governance
  gates (schema, claim-scan, claim-capability, page-authority, freshness, cannibalization, noindex,
  service-authority, jurisdiction) already run in the pure engine.
- **To build (parked):**
  1. a `deployGates` **schema** in `@sys/canon` + a `runBundle()` decider in `@eng/governance` that
     reads the bundle, runs governance gates inline, and shells out to functional runners — **ENG-1840
     (governance runtime)**.
  2. functional **runners**: an i18n-coverage agent, a mobile-render agent, a link crawler.
  3. **deploy-script wiring**: `scripts/deploy-staging.sh` calls `runBundle staging` and aborts on a
     deploy-blocking failure — **ENG-1839 (consume the engine in Qarar + CI gate)**.

## Atlas vs Canon boundary (NORMATIVE)

Rule: **edges belong to Atlas; node invariants belong to Canon.**

Atlas is the propagation/parity guard. It registers couplings between artifacts and fails when a change
to one artifact was not propagated to its registered dependents.

Canon is the semantic validity/completeness guard. It evaluates the current state of governed objects and
fails when an object is not true, complete, permitted, or launchable.

**Diagnostic (use this to place a new rule):**
- "You changed X but not Y" → **Atlas**.
- "X is not valid / sellable / publishable / allowed" → **Canon**.

Do not encode file-coupling parity in Canon. Do not encode business-state validity in Atlas. Both gates
may block deploy, but they block for different reasons.

**Canon references objects, not files.** Canon still needs relationships — but *semantic* ones (by id),
never Atlas-style file edges. This is not a second dependency graph: Atlas says which source files must
move together; Canon says which business objects must exist and be valid for another to be allowed.

```yaml
service_id: uae-mainland-company-formation
requires:
  price_id:            price.uae_mainland_company_formation
  workflow_id:         workflow.company_formation.ae_mainland
  claim_set_id:        claims.company_formation
  jurisdiction_scope_id: jurisdiction.ae_dubai_mainland
```

### The four deploy gates, by owner and reason

| Gate | Owner | Blocks on |
|---|---|---|
| `atlas-parity` | `@sys/atlas` | a change not propagated across registered edges |
| `canon-validate` | `@sys/canon` | invalid registry shape / schema mismatch |
| `canon-completeness` | `@eng/governance` | invalid business state (e.g. sellable service missing a price/workflow/authority) |
| `canon-claims` | `@eng/governance` | unapproved / restricted / capability-mismatched claim |

Name the value-state gate `canon-completeness` (not `catalog-completeness`): the pattern covers services,
pages, claims, partners, data fields, and jurisdictions — not only the catalog.

## North-star (deferred — do NOT build ahead of real gates)

The end-state is one **Governance Capability**: separate truth systems + separate evaluators + one runner
+ one report. Atlas = graph validator · Canon = state validator · runner = orchestrator · console = operator
surface · audit = memory. The outside world sees one verdict (`GovernanceReport`); internally each evaluator
stays pure. Agents would call one facade — `governance.evaluate({ action, subject, context })` — and the
runner decides which checks apply (a runtime *send_message* runs Canon only; a *merge_config* runs both).

**Sequencing discipline (intentional):**
- Adopt **now**: the boundary, the diagnostic, the gate names, semantic-refs, the one-report model.
- **Defer** until 2–3 real gates exist and the decision shape has stabilized: `@eng/parity` as a package
  (Atlas already has its evaluator and is *vendored* — don't split its brain for symmetry), the
  `governance-runner` package, the agent facade, and `GovernanceConsole` (a product surface). Until then,
  keep the boundary as **folders + the existing contract**, not new packages. The runner should *emerge
  from* real evaluators, not precede them.
- **Reconcile, don't fork, primitives.** Reuse what the engine already ships: `Severity`
  (`critical/high/medium`), `GatePolicy.{blocksDeploy,blocksLaunch}`, `GovernanceDecision`, and provenance
  `evidence: [{source, ref}]` — which already *is* `EvidenceRef`. Generalize these; do not invent parallels.
- **Cross-repo reality:** Atlas is vendored into Qarar (`vendor/sys-atlas.tgz`, developed in `~/projects/sys`);
  Canon lives in `sys-canon`. The boundary holds across repos — they are not colocated in one `packages/` tree.

## Design principles honored

- **Engine stays boring/pure** — all side-effects live in functional runners outside it.
- **Governance trails reality** — a gate blocks only on a *checkable* fact (a dead link, a missing
  translation, an unbacked claim); when the fact is fixed, the gate clears itself.
- **One place to declare it** — the bundle file is the single source of "what must be true to ship,"
  readable by a non-engineer.
- **Edges → Atlas, nodes → Canon** — structural coupling and semantic validity are separate concerns and
  must stay in separate systems, composed by a runner, never merged into one brain.
