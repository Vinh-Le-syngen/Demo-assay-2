# `@sys/errors` Study: Error-Code Registry & Declarative Alert Routing

## 1. Domain Context: Why a Shared Error Vocabulary?

When a distributed system throws an error, two decisions must happen fast:
- **Should we retry?** Retrying a `PAYMENT.CARD.DECLINED` wastes time; retrying `RT.DB.TIMEOUT` is correct.
- **Who needs to know?** A `PAYMENT.CARD.DECLINED` wakes nobody up; a `RT.DB.CORRUPTION` pages the on-call.

Without a shared registry these decisions scatter across the codebase — hardcoded booleans, copy-pasted routes, no audit trail. `@sys/errors` solves this by making the **error vocabulary data, not code**: a registry of codes, each declaring `retryable` and `alert` route, that a pure engine evaluates at runtime.

Codes follow the pattern `DOMAIN.AREA.CONDITION` (e.g. `AUTH.TOKEN.INVALID_SIGNATURE`). The domain vocabulary itself is declared per registry, so one engine serves both shapes:

- **Substrate registries** (e.g. `cadre-os`): `DOMAIN ∈ { RT, INT, DOM, CTL, EXP }` — runtime / integration / domain / control / experience planes.
- **Product registries** (e.g. `qarar`): `DOMAIN` = owning component — `AUTH`, `DOC`, `AML`, `WORKFLOW`, …

The authoritative invariant: `retryable` is set per spec and callers MUST NOT override it. `isRetryable` returns `false` for unknown codes (fail closed). This means adding a new code to the registry is the only correct way to change retryability — not a scattered `catch` block.

---

## 2. Package Overview

| Attribute | Value |
|-----------|-------|
| **Package** | `@sys/errors@0.0.1` |
| **System plane** | Governance (primary), Observability (secondary) |
| **Cross-runtime** | `false` — TypeScript/Node only |
| **Test profile** | `lightweight` |
| **Dependencies** | `@sys/telemetry` (type contract only), `zod@^4.3.6` |
| **Source** | `packages/errors/src/` — `types.ts`, `core.ts`, `index.ts` |
| **taxonomy.yaml** | `id: sys-errors`, path `packages/errors` |

**Core public API** (`src/core.ts`):

| Function | Signature | File:Line | Purpose |
|----------|-----------|-----------|---------|
| `defineRegistry` | `(registry) → ErrorRegistry` | `core.ts:41` | Composition root — Zod-validates at load time |
| `lookup` | `(registry, code) → ErrorSpec \| undefined` | `core.ts:46` | Find spec by exact code |
| `isRetryable` | `(registry, code) → boolean` | `core.ts:51` | Authoritative retryability; fails closed |
| `domainOf` | `(code) → Domain \| undefined` | `core.ts:56` | Extract `DOMAIN` prefix; rejects malformed codes |
| `classify` | `(error, matchers, fallback) → string` | `core.ts:65` | Map unknown thrown value → registered code |
| `validateRegistry` | `(registry) → string[]` | `core.ts:81` | Lint gate — returns human-readable issue list |
| `alertPlan` | `(spec, policy) → AlertDecision` | `core.ts:122` | Resolve routing decision for an error occurrence |
| `toTelemetryEvent` | `(registry, code, ctx) → TelemetryEvent` | `core.ts:151` | Convert occurrence to `@sys/telemetry` event |

**Key types** (`src/types.ts`):

```typescript
// types.ts:11–31
interface ErrorSpec {
  code: string                 // DOMAIN.AREA.CONDITION — required
  domain: Domain               // must equal code's first segment — required
  retryable: boolean           // AUTHORITATIVE — required
  message?: string             // operator-facing description
  remediation?: string         // what to do about it
  owner?: string               // owning component id (e.g. 'COMP-AUTH')
  severity?: Severity          // default 'error'; used by toTelemetryEvent
  alert?: string               // route key resolved against AlertPolicy
  deprecated?: boolean         // kept-for-compat; do not emit new instances
  replacedBy?: string          // successor code (required when deprecated: true)
}

// types.ts:33–38
interface ErrorRegistry {
  schemaVersion: number        // required; positive integer
  domains?: Domain[]           // optional; when present, validateRegistry enforces vocabulary
  codes: ErrorSpec[]           // required
}
```

---

## 3. Contract Audit (The Sys Standard Conformance)

**Rule 1: Single Composition Root (`defineX()`)**
- ✅ **PASS** — `defineRegistry(registry)` at `core.ts:41–43`
- Takes `ErrorRegistry`, runs `errorRegistrySchema.parse(registry)`, returns validated object.
- Throws `ZodError` at load time on bad input — errors surface at composition, not at runtime.

**Rule 2: Zod-validated Config**
- ✅ **PASS** — Two exported schemas at `core.ts:21–38`
- `errorSpecSchema` validates each code entry (code, domain, retryable required; all others optional).
- `errorRegistrySchema` validates the full registry (schemaVersion, optional domains, codes array).
- Both schemas exported — can be imported from `@sys/errors/core` for downstream linting.

**Rule 3: Zero App-Specific Imports**
- ✅ **PASS** — `core.ts:1–16`; `types.ts:1`
- Only `zod` (third-party) and `@sys/telemetry` (type-only contract for `Severity` and `TelemetryEvent`).
- No product imports, no app imports, no `node:` stdlib. Fully isomorphic.

**Rule 4: Ships `dist/`**
- ✅ **PASS** — Three entry points via tsup (`package.json:21–35`; `tsup.config.ts:4–16`)
- `.` (index), `./core`, `./types` — each with ESM + CJS + `.d.ts` + sourcemaps.
- `@sys/telemetry` marked external (not bundled). `"sideEffects": false`.

**Rule 5: Classified in `taxonomy.yaml`**
- ✅ **PASS** — Entry at `taxonomy.yaml:974–1001`
- `id: sys-errors`, `primary_plane: governance`, `secondary_planes: [observability]`, `status: active`.
- Modules table lists `core.ts` (plane: governance) and `types.ts` roles.

---

## 4. How the Key Functions Work — Walk-Through

### `validateRegistry` — the lint gate (`core.ts:81–108`)

This is the function to wire into CI. It checks six categories and returns every issue it finds:

```
1. Malformed code       — doesn't match DOMAIN.AREA.CONDITION regex
2. Domain mismatch      — code's prefix ≠ declared domain field  
3. Off-vocabulary       — domain not in registry.domains (only when domains is declared)
4. Duplicate code       — same code string appears twice
5. Missing successor    — deprecated: true but no replacedBy
6. Dangling successor   — replacedBy points to a code not in the registry
```

In **shape-only mode** (no `domains` declared), only checks 1, 4, 5, 6.

### `alertPlan` — routing decision (`core.ts:122–143`)

Rules are tried in order: **exact code match → prefix match → domain match → policy default → route 'none' (suppressed)**.

```typescript
// A prefix 'RT' matches any code starting with 'RT.' (e.g. 'RT.DB.TIMEOUT', 'RT.QUEUE.FULL')
// Severity: rule overrides spec overrides 'error' default
const decision = alertPlan(lookup(reg, 'RT.DB.TIMEOUT')!, policy)
// → { code: 'RT.DB.TIMEOUT', route: 'pager', severity: 'fatal', suppress: false }
```

### `toTelemetryEvent` — observability bridge (`core.ts:151–183`)

Converts an error occurrence into a `@sys/telemetry` event (domain `'error'`, type = code). Unknown codes still emit, marked `registered: false`. Deprecation flags surface in event data so dashboards can track adoption of successor codes.

---

## 5. Tests & Gaps

**Current suite** (`src/__tests__/core.test.ts`): 16 cases across 5 describe blocks.

| Block | Cases | What's covered |
|-------|-------|----------------|
| `lookup / isRetryable / domainOf` | 3 | Known + unknown codes; fail-closed; malformed codes |
| `classify` | 2 | First-wins matcher order; throwing matcher; fallback |
| `validateRegistry` | 3 | Clean registry; all 6 issue categories; shape-only mode |
| `alertPlan` | 5 | Exact / prefix / domain match; default; no-rules suppress |
| `toTelemetryEvent` | 3 | Known + unknown codes; deprecation in event data |

**Gaps surfaced during study** (verified by reading `core.ts` directly):

| Gap | Why it matters |
|-----|----------------|
| Circular `replacedBy` chain (`A → B → A`) | `validateRegistry` only checks that `replacedBy` points to an existing code — it doesn't detect cycles. An `A → B → A` loop would silently pass. |
| Empty registry (`codes: []`) | Valid by schema; `validateRegistry` passes. Worth pinning as regression. |
| `defineRegistry` with invalid input | No test that `defineRegistry({ codes: 'oops' })` throws `ZodError`. Confirms the Zod gate works. |

These three cases are closed in the artifact PR below.

---

## 6. Associated Artifact — Missing Test Cases (PR)

**What ships:** Three new test cases added to `src/__tests__/core.test.ts` closing the gaps above. The file diff is reviewable and each test documents the behaviour it pins.

**Verification:** `pnpm --filter @sys/errors test` — all 19 cases pass (16 existing + 3 new).

A reference substrate registry for study and demos is at `packages/errors/docs/sample-registry.json`. It shows a real-world registry shape: a substrate domain (`RT`, `INT`, `DOM`, `CTL`) + a product domain (`AUTH`), with deprecated codes, alert routes, and owner metadata.

---

## 7. Lessons & Connection Points

- **`@sys/errors` ↔ `@sys/telemetry`**: Errors feed into the telemetry spine. Every `toTelemetryEvent` call needs a telemetry host to actually emit the event — the connection is the contract, not a direct call.
- **`@sys/errors` ↔ CI**: `validateRegistry` is the natural CI lint gate. Wire it as `node -e "import('@sys/errors').then(m => { const issues = m.validateRegistry(reg); if (issues.length) process.exit(1) })"` — or extend `@sys/assay` with a registry check trigger.
- **The data insight**: The vocabulary (`domains`) is declared per registry. One engine serves a substrate registry and a product registry simultaneously. Changing error taxonomy = changing data, not code.
