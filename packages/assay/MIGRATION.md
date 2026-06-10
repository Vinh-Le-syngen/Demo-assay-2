# Migrating @sys/assay

## 0.1.0 → 0.2.0 (report-shape only)

No manifest or config changes are required, and the CLI behaves identically. The single breaking
change is for **library callers**: `AuditReport` is now `{ findings: AssayFinding[], total, onDisk }`
instead of separate `untracked`/`stale`/`shells`/… fields. Migrate field access to the
`findingsForGate(report, gate)` selector — e.g. `report.shells.egregious` becomes
`findingsForGate(report, 'noShells').filter(f => f.severity === 'fatal')`. New in 0.2.0: the
`warnOnly` config (see step 3 below).

## 0.0.1 → 0.1.0

0.1.0 adds the canonical taxonomy and three classification/coverage gates. **Most consumers upgrade
with no manifest edits.** Only two manifest patterns hard-break (both caught at parse time, with a
clear message — never a silent change in meaning):

| Old manifest pattern | 0.1.0 result | Fix |
|----------------------|--------------|-----|
| `risk` outside `low\|medium\|high\|critical` (e.g. `normal`, `risky`, `P0`, or `med`) | parse error, exit 1 | map to the closed enum |
| `category` that isn't canonical or `x-local-*` | parse error, exit 1 | map to a canonical category, or `x-local-*` to incubate |
| `category` present, no `subtypes` | **warn** (non-fatal) | add `subtypes`, or ignore |
| only `path` (+ standard `risk`/`triggers`) | passes unchanged | nothing |

The new `validClassification` and `authorSeparation` gates are **on by default but no-op on entries
without a `category`**. The `coverage` gate is **off by default**. So an un-classified manifest is
unaffected until you start classifying.

## Recommended path (incremental, never blocks the build mid-migration)

1. **Pin the new tarball.** Pack `sys-assay-0.3.0.tgz`, drop in `vendor/`, bump the `file:` dep.
2. **Normalize the two breaking fields first** (these are the only hard parse failures):
   - `risk` → one of `low | medium | high | critical`. Suggested map: `normal→medium`, `risky→high`,
     `P0/P1→critical`, `P2→high`, `P3→medium`, `P4→low`. Adjust to your scheme. (Note: 0.3.0 renamed
     `med`→`medium`; a 0.1.0/0.2.0 manifest using `med` must be updated too.)
   - `category` → a canonical value (`unit, integration, e2e, regression, property, negative,
     adversarial, stress, governance, canary, smoke, observability`) or `x-local-<name>` to park a
     not-yet-canonical kind. Register the latter in config `taxonomy.experimentalCategories`.
3. **Monitor per-gate with `warnOnly` (0.2.0+).** Put the not-yet-ready gates in
   `warnOnly: ["validClassification", "authorSeparation", "coverage"]`. They're evaluated and
   printed but never fail CI — even under `--strict` — while the gates you've already satisfied stay
   enforcing. This is finer-grained than running without `--strict` (which mutes everything). On
   0.1.0, the only monitor lever is a non-`--strict` run. (A *malformed* manifest still exits 1 — that's step 2's job.)
4. **Phase in the gates.** Promote a gate by removing it from `warnOnly` once its findings are clean.
   (Disabling a gate entirely is still available via `gates.<name>: false`.)
   Governance-sensitive categories (`governance`, `adversarial`, `canary`) require an `author`; high/
   critical ones also require a `reviewer` distinct from the author.
5. **Adopt coverage last.** Set `coverage.profile` (`virtual` → `lightweight` → `full`) and/or
   `coverage.areaProfiles` per area, with justified `coverage.overrides` (each needs a `reason`).
   Flip `gates.coverage: true` only when an area is ready. Use `--report` to see the matrix first.
6. **Turn `--strict` on in CI** once clean.

## Rollback

Revert the `file:` dep to `sys-assay-0.0.1.tgz`. Any classification fields you added are ignored by
0.0.1 (it reads only `path`/`risk`/`triggers`), and `risk` values you normalized remain valid there
— so rollback is safe and lossless.

## Zero-friction check

```
# does any manifest entry use a non-standard risk or a non-canonical category?
node -e 'const m=require("./tests/manifest.json");const R=["low","medium","high","critical"];const C=["unit","integration","e2e","regression","property","negative","adversarial","stress","governance","canary","smoke","observability"];for(const t of m.tests){if(t.risk&&!R.includes(t.risk))console.log("risk",t.path,t.risk);if(t.category&&!C.includes(t.category)&&!/^x-local-/.test(t.category))console.log("cat",t.path,t.category)}'
```

No output → you can upgrade and run `--strict` immediately.
