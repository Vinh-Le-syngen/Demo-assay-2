# CI/CD extraction into `@sys/*` — status + proposal

Tracks bringing cadre-os's portable CI/CD subsystems into the shared `@sys/*` folder.
Scope agreed 2026-06-03. Plane vocabulary = 5-plane (see `taxonomy.yaml`).

## Done

| Package | cadre-os source | What it is | Plane | Tests |
|---|---|---|---|---|
| **@sys/atlas** | SYS-ATLAS | Dependency-graph impact analysis + propagation guard (pure: `affected` / `validateGraph` / `propagationGaps`) + `sys-atlas` CLI | governance | 16 |
| **@sys/checkpoint** | SYS-CHECKPOINT | Git-safety gate harness — `protectedBranch` / `author` / `cleanTree` / `protectedPath` gates over an injected `GitState` + `sys-checkpoint` CLI | governance | 15 |
| **@sys/gatekeeper** | SYS-GATEKEEPER (promotion role) | Promotion gate — pure `promotionVerdict` → ALLOW/DENY/REVIEW + `stagingFirstPolicy` + `sys-gatekeeper` CLI (exit 0/1/2) | governance | 11 |

All pass the full `pnpm check` gate (boundaries + taxonomy + typecheck + tests). Not yet
vendored into any consumer (Qarar wiring is a separate decision).

## Key finding: CD is not a system — it's a scattered flow

cadre-os has **no `SYS-CD`/`SYS-DEPLOY`**. "Deployment" is a chain of lifecycle verbs
(ADR-0071, `genesis-cli.sh`): **Genesis(compile)** → **WARP(`warp-activate.sh`, symlink swap)**
→ **run (`install-daemons.sh`)** → **GATEKEEPER(`promote-staging.sh`, staging→main)**, with
**SYS-STATE** (planned) as the deployment ledger. That's config-artifact deployment — an OS
shipping its own compiled config into symlinked `instances/`.

For a **Vercel-deployed app like Qarar, none of that applies**: Vercel is the deploy substrate
(git push staging → build → deploy). The only portable CD slice is the **promotion gate** —
hence `@sys/gatekeeper` is the whole of "CD as @sys" for qarar. compile/activate/instances/STATE
are intentionally NOT extracted.

## Deferred

### `@sys/ci` (CI — semantic finding/triage model) — DEFERRED
Decision (2026-06-03): deferred. Qarar's integration is already covered by GitHub Actions +
pre-commit hooks + `@sys/assay` + `@sys/checkpoint`. A semantic triage/regression layer is a
nice-to-have, not a gap. The design below stands if/when we want it.

### `@sys/ci` design (if revived)
**Portable part:** the finding model + severity routing + regression detection. **NOT portable:**
the launchd `ci-daemon.sh`, `coordination.db`, agent-result JSON ingestion.

Proposed pure API (mirrors warp/atlas — data in, verdicts out):
```ts
type Finding = { id: string; severity: 'critical'|'high'|'medium'|'low'; source: string; summary: string }
triage(rawResults, rules): Finding[]            // classify + route by severity
regressions(prevFindings, currFindings): Finding[]  // new this run vs last
gateVerdict(findings, policy): 'pass'|'block'   // e.g. block if any critical
```
**Open decisions:**
1. **Persistence.** cadre-os keeps finding history (regression needs "last run"). Keep `@sys/ci`
   pure (caller supplies prev+curr) or add an injected store seam? → *Recommend pure; caller owns
   storage*, consistent with the other packages.
2. **Overlap with `@sys/assay`.** Assay already runs suites + quality gates. Is `@sys/ci` just the
   *triage/regression* layer ON TOP of assay output? → *Recommend yes: `@sys/ci` consumes test
   results (from assay or any runner) and adds finding/severity/regression semantics.* Avoids
   duplicating execution.
3. **Input shape.** Define a minimal `TestResult`/`RawResult` contract `@sys/ci` triages, so it's
   runner-agnostic (vitest, pytest, shell).

## Explicitly out of scope
Registrar / Docket / Shuttle / Loom / Rectifier (cadre-os GID task-queue orchestration — no Qarar
analog). RAG (heavy Python substrate, no consumer). Standards (doctrine/docs, little code).
