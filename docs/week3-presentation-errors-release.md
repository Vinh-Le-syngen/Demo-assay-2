# Week 3 Deep-Dive: `@sys/errors` & `@sys/release`

**Person A · Sys Standards & Test Quality**
**Friday, Week 3 · ~30 min**

---

## Agenda

1. **`@sys/errors`** — Error vocabulary as data (~15 min)
   - Why it exists · the domain problem
   - Package contract check (5 rules)
   - Walking the key functions
   - Tests, gaps, artifact

2. **`@sys/release`** — The release attestor (~12 min)
   - Attestor vs. engine — the critical distinction
   - Package contract check (5 rules)
   - The forgery-detector: how tarball inspection works
   - Live demo

3. **Connecting the dots** (~3 min)

---

---

# Part 1 — `@sys/errors`

## The Problem: Scattered Retryability

In any distributed system, two decisions must happen on every thrown error:

> **Should we retry this?**
> **Who needs to wake up?**

Without a shared registry, these answers scatter across every `catch` block:

```typescript
// ❌ Before — the same decision in 12 different places
catch (err) {
  if (err.code === 'ETIMEDOUT') retry()          // copy-pasted 12 times
  if (err.message.includes('declined')) alert()  // inconsistent, no audit trail
}
```

The problem with this pattern:
- Change retryability for `RT.DB.TIMEOUT` → hunt down every `catch` block
- No single place to ask "what alert route does `AUTH.TOKEN.INVALID_SIGNATURE` get?"
- Unknown errors: what's the safe default? (It should be **non-retryable**, but scattered code forgets)

---

## The Solution: Error Vocabulary as Data

`@sys/errors` moves the vocabulary out of code and into a **registry**:

```typescript
// ✅ After — the whole vocabulary in one place
const reg = defineRegistry({
  schemaVersion: 2,
  domains: ['RT', 'INT', 'AUTH', 'DOC'],
  codes: [
    { code: 'RT.DB.TIMEOUT',              domain: 'RT',   retryable: true,  alert: 'pager'          },
    { code: 'INT.STRIPE.DECLINED',        domain: 'INT',  retryable: false, alert: 'none'           },
    { code: 'AUTH.TOKEN.INVALID_SIGNATURE', domain: 'AUTH', retryable: false, alert: 'slack-security' },
  ],
})

isRetryable(reg, 'RT.DB.TIMEOUT')   // → true  (authoritative)
isRetryable(reg, 'GHOST.CODE.X')    // → false (fail closed — unknown = don't retry)
```

**The authoritative invariant** (`core.ts:51–53`):
> `retryable` is declared in the spec. Callers MUST NOT override it.
> `isRetryable` returns `false` for unknown codes — it fails closed, not open.

---

## Code Shape: `DOMAIN.AREA.CONDITION`

```
AUTH   .   TOKEN   .   INVALID_SIGNATURE
  │           │               │
DOMAIN      AREA          CONDITION
(vocabulary) (subsystem)  (what went wrong)
```

**The vocabulary is data** — declared per registry via `domains: ['RT', 'INT', 'AUTH', ...]`.  
One engine serves two registry shapes without any changes:

| Registry type | `domains` | Example codes |
|---|---|---|
| **Substrate** (`cadre-os`) | `RT, INT, DOM, CTL, EXP` | `RT.DB.TIMEOUT`, `INT.STRIPE.DECLINED` |
| **Product** (`qarar`) | `AUTH, DOC, AML, WORKFLOW` | `AUTH.TOKEN.EXPIRED`, `DOC.EXTRACT.FAILED` |

Changing error taxonomy = **changing data, not code**.

---

## Taxonomy: Which Plane?

From `taxonomy.yaml:974–1001`:

```yaml
id: sys-errors
primary_plane: governance      # decision authority: retryable, alert route
secondary_planes: [observability]  # emits @sys/telemetry events
cross_runtime: false           # TypeScript/Node only (no JSON Schema needed)
test_profile: lightweight
```

**Governance plane** because `@sys/errors` makes authoritative decisions — is this retryable? which route? — that all other code must respect.

---

## Contract Check — 5 Rules

### Rule 1: `defineRegistry()` composition root
✅ **PASS** — `core.ts:41–43`

```typescript
export function defineRegistry(registry: ErrorRegistry): ErrorRegistry {
  return errorRegistrySchema.parse(registry) as ErrorRegistry
}
```

Throws `ZodError` at load time on bad input. Errors surface at composition, not at runtime.

---

### Rule 2: Zod-validated config
✅ **PASS** — Two schemas at `core.ts:21–38`

```typescript
export const errorSpecSchema = z.object({
  code: z.string(),
  domain: z.string(),
  retryable: z.boolean(),          // required — the authoritative flag
  message: z.string().optional(),
  remediation: z.string().optional(),
  alert: z.string().optional(),
  deprecated: z.boolean().optional(),
  replacedBy: z.string().optional(),
  // ...
})

export const errorRegistrySchema = z.object({
  schemaVersion: z.number().int().positive().optional(),
  domains: z.array(z.string()).optional(),
  codes: z.array(errorSpecSchema),   // required
})
```

Both schemas are **exported** — importable from `@sys/errors/core` for downstream use.

---

### Rule 3: Zero app-specific imports
✅ **PASS** — `core.ts:1–16`, `types.ts:1`

```typescript
import { z } from 'zod'                              // ✓ third-party
import type { Severity, TelemetryEvent } from '@sys/telemetry'  // ✓ @sys/ type-only
import type { AlertDecision, ... } from './types'    // ✓ local
```

No product imports. No `node:` stdlib. Fully isomorphic (runs anywhere).

---

### Rule 4: Ships `dist/`
✅ **PASS** — `package.json:21–35`, `tsup.config.ts:4–16`

Three entry points, all with ESM + CJS + `.d.ts`:

| Import path | Entry file | Use |
|---|---|---|
| `@sys/errors` | `dist/index.js` | Most callers |
| `@sys/errors/core` | `dist/core.js` | Direct access to schemas |
| `@sys/errors/types` | `dist/types.js` | Type-only import |

`"sideEffects": false` — fully treeshakeable.

---

### Rule 5: Classified in `taxonomy.yaml`
✅ **PASS** — `taxonomy.yaml:974–1001`

```yaml
id: sys-errors       kind: package       path: packages/errors
npm: "@sys/errors"   status: active      owner: unassigned
```

Modules table lists `core.ts` (governance, pure functions) and `types.ts` (contracts).

---

## Walking the Key Functions

### `validateRegistry` — the lint gate (`core.ts:81–108`)

Returns `string[]`. Empty = clean. **Wire into CI.**

Six things it checks:

```
1. Malformed code        — doesn't match DOMAIN.AREA.CONDITION regex
2. Domain mismatch       — code's prefix ≠ spec's domain field
3. Off-vocabulary domain — domain not in registry.domains (vocabulary mode only)
4. Duplicate code        — same code string appears twice
5. Missing successor     — deprecated: true but no replacedBy
6. Dangling successor    — replacedBy points to a non-existent code
```

```typescript
const issues = validateRegistry(reg)
// ['malformed code "lowercase.bad"', 'domain mismatch on "INT.X.Y"', ...]
if (issues.length > 0) process.exit(1)  // CI gate
```

---

### `alertPlan` — routing decision (`core.ts:122–143`)

Rules evaluated in order. **First match wins.**

```
exact code match  →  prefix match  →  domain match  →  policy default  →  route 'none' (suppressed)
```

```typescript
const policy: AlertPolicy = {
  rules: [
    { match: { code: 'INT.STRIPE.DECLINED' }, route: 'none', suppress: true },
    { match: { prefix: 'RT' },               route: 'pager', severity: 'fatal' },
    { match: { domain: 'AUTH' },             route: 'slack-security' },
  ],
  default: { route: 'slack-ops' },
}

alertPlan(lookup(reg, 'RT.DB.TIMEOUT')!, policy)
// → { code: 'RT.DB.TIMEOUT', route: 'pager', severity: 'fatal', suppress: false }
//   ↑ prefix 'RT' matched; rule overrides severity from spec ('error' → 'fatal')

alertPlan(lookup(reg, 'INT.STRIPE.DECLINED')!, policy)
// → { code: 'INT.STRIPE.DECLINED', route: 'none', severity: 'warn', suppress: true }
//   ↑ exact match; spec's severity 'warn' used (rule has none)
```

**Severity fallback chain:** rule → spec → `'error'` (hardcoded default)

---

### `toTelemetryEvent` — observability bridge (`core.ts:151–183`)

Converts an error occurrence into a `@sys/telemetry` event (domain `'error'`).

```typescript
const event = toTelemetryEvent(reg, 'AUTH.TOKEN.INVALID_SIGNATURE', {
  id: 'ev1', ts: '2026-06-14T…', traceId: 'tr1',
  actor: { id: 'api-server', type: 'service' },
  data: { attempt: 1 },
})

// event =
// {
//   domain: 'error',
//   type: 'AUTH.TOKEN.INVALID_SIGNATURE',
//   severity: 'error',
//   traceId: 'tr1',
//   data: {
//     registered: true,
//     retryable: false,
//     domain: 'AUTH',
//     owner: 'COMP-AUTH',
//     attempt: 1,
//   }
// }
```

**Unknown codes still emit**, marked `registered: false`. Never silent.

---

## Tests & Gaps

`pnpm --filter @sys/errors test` → **19 tests, 1 file, all pass.**

| Describe block | Cases | What's covered |
|---|---|---|
| `lookup / isRetryable / domainOf` | 3 | Known + unknown codes, fail-closed, malformed codes |
| `classify` | 2 | First-wins matcher order, throwing matcher, fallback |
| `validateRegistry` | 3 | Clean registry, all 6 issue types, shape-only mode |
| `alertPlan` | 5 | Exact / prefix / domain match, default, no-rules suppress |
| `toTelemetryEvent` | 3 | Known + unknown codes, deprecation in event data |
| **`validateRegistry` — gap coverage** *(new)* | 3 | Empty registry, circular chain (documented gap), Zod gate |

**Three gap cases added as the artifact** (`core.test.ts` — reviewed, green):

```typescript
// Gap 1 — empty registry is valid; pin as regression
it('passes an empty codes array', () => {
  expect(validateRegistry({ schemaVersion: 1, codes: [] })).toEqual([])
})

// Gap 2 — circular replacedBy chain: A → B → A
// Both codes exist, so validateRegistry sees no dangling successor.
// Cycle detection is a documented gap — the test pins CURRENT behaviour.
it('does not detect circular replacedBy chains (documented gap)', () => {
  const cyclic = { schemaVersion: 1, codes: [
    { code: 'DOM.A.ONE', domain: 'DOM', retryable: false, deprecated: true, replacedBy: 'DOM.B.TWO' },
    { code: 'DOM.B.TWO', domain: 'DOM', retryable: false, deprecated: true, replacedBy: 'DOM.A.ONE' },
  ]}
  expect(validateRegistry(cyclic)).toEqual([])  // no issues — the gap
})

// Gap 3 — defineRegistry rejects invalid input
it('defineRegistry throws ZodError on structurally invalid input', () => {
  expect(() =>
    defineRegistry({ schemaVersion: 1, codes: 'not-an-array' } as any)
  ).toThrow()
})
```

---

## Artifact: Sample Registry + 3 Test Cases

**`packages/errors/docs/sample-registry.json`** — a reference substrate + product registry (9 codes, 5 domains: `RT`, `INT`, `DOM`, `CTL`, `AUTH`) showing:
- Alert routes per domain (`pager`, `slack-security`, `none`)
- Deprecated code with a valid `replacedBy` successor (`AUTH.TOKEN.EXPIRED` → `AUTH.SESSION.EXPIRED`)
- Owner metadata for escalation routing

**`packages/errors/src/__tests__/core.test.ts`** — 3 new test cases (PR #2, merged to main).

---

---

# Part 2 — `@sys/release`

## The Critical Distinction: Attestor vs. Engine

> **"Changesets handles version bumps. `@sys/release` handles proving you shipped what you said you shipped."**

| | Changesets | `@sys/release` |
|---|---|---|
| **What it does** | Computes version bumps, rewrites ranges, generates changelogs, publishes to npm | Snapshots the produced versions, validates consumer adoption claims |
| **Input** | Your commit history, bump files | The workspace as Changesets left it |
| **Output** | New `package.json` versions, `CHANGELOG.md` | `baseline-2026.06.0.json` (release set), `ReleaseDecision` (allow/deny/warn) |
| **Enforces** | Semver conventions | That the bundle is internally consistent and matches what consumers claim |

The reason for the split: Changesets can't know if a `file:vendor/foo-1.1.0.tgz` actually contains version `1.1.0` inside the tarball. `@sys/release` can.

---

## The Problem It Solves — The Qarar 404

During the publishing window (after Changesets rewrites ranges, before packages appear on the registry), products like Qarar use vendored tarballs:

```json
"dependencies": {
  "@sys/canon": "file:vendor/sys-canon-1.0.0.tgz"
}
```

**The forgery scenario**: the tarball filename says `1.0.0`. The `sys.lock.json` claims `1.0.0`. But inside the tarball, `package/package.json` says `"version": "0.9.0"`. Old code ships. No error.

**`@sys/release adoption validate`** cracks the tarball open and checks:

```
src/node-host.ts  → execSync('tar -xOf <tarball> package/package.json')
adoption.ts       → parse the output, compare tarball version to lock version
                  → Finding: tarball_metadata_mismatch (blocker) if they differ
```

---

## The Three-Step Pipeline

```
Changesets              @sys/release               @sys/release
(bumps versions)    set create               set validate          adoption validate
                                                                    (product-side)

workspace.ts         release-set.ts            adoption.ts
discoverWorkspace  → createReleaseSet()  →   validateAdoption()
 packages           snapshot: 27 pkgs         diff lock vs actual
 + versions                                   crack tarballs open
                         ↓                          ↓
                   baseline-2026.06.0.json    ReleaseFinding[]
                                                          ↓
                                                   decide.ts
                                                   allow | deny | warn
```

---

## Taxonomy: Which Plane?

From `taxonomy.yaml:930–972`:

```yaml
id: sys-release
primary_plane: governance      # attestation decisions — allow/deny/warn
secondary_planes: [data]       # owns the ReleaseHost seam (file IO, tar)
cross_runtime: true            # JSON schemas ship for Python/bash consumers
test_profile: full             # unit + integration + e2e + adversarial
```

---

## Contract Check — 5 Rules

### Rule 1: `defineRelease()` composition root
✅ **PASS** — `src/config.ts:12–14`

```typescript
export function defineRelease(deps: ReleaseSeams): ReleaseConfig {
  releaseConfigSchema.parse({})   // empty schema — seams ARE the config
  return deps as ReleaseConfig
}
```

The schema is empty by design — there are no scalar config fields. The `ReleaseHost` seam is everything.

---

### Rule 2: Zod schemas
✅ **PASS** — `src/schemas.ts:8–40`

```typescript
const calver = z.string().regex(/^\d{4}\.\d{2}\.\d+$/)   // YYYY.MM.N
const semver  = z.string().regex(/^\d+\.\d+\.\d+$/)

export const releaseSetSchema = z.object({
  schema_version: z.literal(1),
  name:    z.string().min(1),
  version: calver,                                   // calendar-versioned
  status:  z.enum(['draft', 'approved', 'live', 'superseded']),
  packages: z.record(z.string(), semver),            // { '@sys/canon': '1.0.0' }
  evidence: z.array(evidenceRef).default([]),
  // ... optional governance fields
})
```

**JSON schemas** also ship in `schema/` (`release-set.schema.json`, `sys-lock.schema.json`) — for non-Node consumers (Python/bash) that can't run TypeScript.

---

### Rules 3, 4, 5
✅ **Zero app-specific imports** — `zod` + `node:fs/path/child_process` only; `node:*` confined to `node-host.ts`.

✅ **Ships `dist/` + `bin`** — `package.json:8–29`
```json
"bin": { "sys-release": "./dist/cli.js" }
"exports": {
  ".": { ... },                        // library
  "./node-host": { ... },              // seam (optional, Node-only)
  "./schema/release-set": "...",       // JSON schema (cross-runtime)
  "./schema/sys-lock": "..."           // JSON schema (cross-runtime)
}
```

✅ **Classified** — `taxonomy.yaml:930–972` · `status: active` · 6 modules documented.

---

## The `decide()` Function — 30 Lines, Pure Logic

The whole verdict in one function (`src/decide.ts:16–30`):

```typescript
export function decide(args: DecideArgs): ReleaseDecision {
  const blocking = args.findings.some(
    f => f.severity === 'blocker' || (args.strict === true && f.severity === 'warning')
  )
  const warned   = args.findings.some(f => f.severity === 'warning')
  const decision = blocking ? 'deny' : warned ? 'warn' : 'allow'

  return {
    decision,
    subject: args.subject,
    reasons: args.findings,
    decidedAt: args.decidedAt,
    policyVersion: args.policyVersion ?? 'release/1',
  }
}
```

**Finding severity map:**

| Finding code | Severity | Cause |
|---|---|---|
| `release_set_version_mismatch` | **blocker** | Lock version ≠ release set version |
| `adoption_package_missing` | **blocker** | Package in lock not found in any manifest |
| `tarball_metadata_mismatch` | **blocker** | Tarball internal version ≠ lock claimed version |
| `adoption_release_set_mismatch` | **blocker** | Lock's `adopts.release_set` doesn't match actual set |
| `tarball_dep_unsatisfiable` | warning | Transitive `@sys` dep inside tarball has no resolution path |
| `evidence_not_recorded` | warning | `live` set has no evidence entries |
| `release_set_stale` | warning | `expires_at` is in the past |

**`--strict` mode** (used in CI): promotes all `warning` → `deny`. Zero tolerance.

---

## Tests — 50 Cases, 15 Files

`pnpm --filter @sys/release test` — every quadrant covered:

| Category | Files | Coverage |
|---|---|---|
| Unit | decide, adoption, release-set, workspace | All pure functions |
| Negative | negative-schema, negative-input | Schema rejection, malformed JSON |
| Integration | integration-drift, integration-pipeline | Version drift detection, full pipeline |
| E2E | e2e-attestation, e2e-attestation-deny | Clean allow; forged tarball deny |
| Governance | governance-policy, governance-freshness | Verdict ladder, expired sets, evidence-less live |
| Adversarial | adversarial-drift, adversarial-protocol | Drifted claim deny; swapped package deny |

Deliberately **not tested** (documented in `docs/design.md:45–53`):
- Version bumping → Changesets owns this
- Real tarball I/O → `memHost()` fixture covers the logic cleanly

---

## Live Demo — Three Commands

```bash
# 1. Dry run — see the snapshot JSON
node packages/release/dist/cli.js set create --name baseline
```

```json
{
  "schema_version": 1,
  "name": "baseline",
  "version": "2026.06.0",
  "status": "live",
  "packages": {
    "@sys/assay": "0.3.0",
    "@sys/canon": "1.0.0",
    "@sys/errors": "0.0.1",
    "@sys/release": "0.0.4"
    // … 27 packages total
  },
  "evidence": [{ "source": "pnpm-check", "ref": "passed" }]
}
```

```bash
# 2. Save it
node packages/release/dist/cli.js set create --name baseline --write
# → saved to .releases/sets/baseline-2026.06.0.json

# 3. Validate — ALLOW, 0 findings
node packages/release/dist/cli.js set validate
# ALLOW release_set:baseline@2026.06.0 — 0 finding(s)
```

**BLOCK scenario:** edit one version in the saved JSON, then re-run `set validate`:
```
DENY release_set:baseline@2026.06.0 — 1 finding(s)
  [blocker] release_set_version_mismatch · @sys/errors
            workspace: 0.0.1 · set: 0.0.2 (edited)
```

---

## Artifact: Live Release Set + Sample `sys.lock.json`

**`.releases/sets/baseline-2026.06.0.json`** — produced by `sys-release set create --write` against the actual workspace. 27 packages, evidence `pnpm-check: passed`.

**`packages/release/docs/sample-sys.lock.json`** — a Qarar-style adoption lock for demo purposes:
```json
{
  "schema_version": 1,
  "product": "qarar",
  "adopts": { "release_set": "baseline@2026.06.0" },
  "packages": {
    "@sys/canon": "1.0.0",
    "@sys/errors": "0.0.1",
    "@sys/release": "0.0.4"
  }
}
```

---

---

# Connecting the Dots

## How These Two Packages Fit the Quality Pipeline

```
 defineRegistry()          validateRegistry()        isRetryable()
 Zod validates input   →   CI lint gate          →   runtime decision
 [composition time]        [build/PR time]            [request time]

         @sys/errors                                @sys/telemetry
         error vocabulary                           error events flow here
                                                    (toTelemetryEvent)

 ─────────────────────────────────────────────────────────────────────

 Changesets               sys-release set create    sys-release adoption validate
 bumps versions       →   snapshots the result  →   consumer proves the claim
 [developer action]       [CI, post-bump]           [product CI]

         @sys/release
         release attestation
```

## The Governance Chain

```
@sys/checkpoint  →  @sys/gatekeeper  →  @sys/release
 (git gate)          (promotion gate)    (version gate)

 "Is the tree clean?"   "Did tests pass?"   "Are the versions what we claimed?"
```

`@sys/release` is the **terminal quality gate** — nothing ships to consumers until adoption validation passes.

## The Data Insight (Both Packages)

Both packages make the same architectural bet: **put the vocabulary in data, not code.**

- `@sys/errors`: the error vocabulary (`DOMAIN.AREA.CONDITION`, `retryable`, alert routes) lives in a registry. Changing it = changing data.
- `@sys/release`: the release bundle (which versions belong together) lives in a `ReleaseSet` JSON. Changing it = changing data.

Both use Zod as the runtime contract. Both export their schemas for downstream use. This is the pattern.

---

## Lessons from the Week

*(Casual — no slides)*

- **The authoritative invariant is the hardest thing to audit.** `retryable` being MUST NOT override is correct by design, but there's no automated check that a caller hasn't bypassed `isRetryable` and hardcoded `true`. That's a code-review concern, not a linter concern — at least for now.
- **`docs/design.md` is underrated.** `@sys/release`'s design doc explains the forgery scenario that motivated the whole package in two paragraphs. Reading it first would have saved an hour of reverse-engineering the adoption validation logic from tests.
- **The gap tests are more valuable than the passing tests.** Writing the three new `@sys/errors` test cases — especially the circular `replacedBy` one that documents a known limitation rather than a guarantee — forced a precise reading of `validateRegistry` that just running the suite wouldn't have surfaced.
- **One thing I'd tell my Monday self:** Start with the test file, not the source. The tests show you what the author thought was worth specifying. The source shows you how they implemented it. Read in that order.

---

*Study docs: [`packages/errors/docs/errors-study.md`](../packages/errors/docs/errors-study.md) · [`packages/release/docs/release-study.md`](../packages/release/docs/release-study.md)*
*Artifacts: `packages/errors/src/__tests__/core.test.ts` (3 new cases) · `packages/errors/docs/sample-registry.json` · `packages/release/docs/sample-sys.lock.json`*
