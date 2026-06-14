# `@sys/release` Study: Release Attestor & Adoption Validator

## 1. Domain Context: Attestation vs. Release Engineering

**Release engineering** (Changesets' job): compute version bumps, rewrite `package.json` ranges, generate changelogs, publish to npm.

**Release attestation** (`@sys/release`'s job): *after* Changesets has run, snapshot the exact versions it produced, bundle them into a provenance-bearing record, and then let consumers prove they are running what they claim to be running.

The gap `@sys/release` fills: nothing stops someone from vendoring `file:vendor/foo-1.1.0.tgz` that internally contains `"version": "0.0.1"`. The consumer's `sys.lock.json` says `1.1.0`, the tarball says `0.0.1`, and the wrong code ships silently. `@sys/release adoption validate` cracks the tarball open and checks.

**The three-step pipeline:**
```
Changesets        →  sys-release set create  →  sys-release set validate  →  sys-release adoption validate
(bumps versions)     (snapshots workspace)       (checks for drift)           (checks product's claim)
```

---

## 2. Package Overview

| Attribute | Value |
|-----------|-------|
| **Package** | `@sys/release@0.0.4` |
| **System plane** | Governance (primary), Data (secondary) |
| **Cross-runtime** | `true` — JSON Schema for non-Node consumers (Python/bash) |
| **Test profile** | `full` (unit + integration + e2e + adversarial) |
| **Dependencies** | `zod@^4.3.6` only — no app deps |
| **Source** | `packages/release/src/` — 10 source files + CLI |
| **taxonomy.yaml** | `id: sys-release`, path `packages/release` |

**Architecture — pure core + injected seam:**

```
                          ┌─────────────┐
                          │  ReleaseHost │   ← injected seam (file IO + tar)
                          │  (interface) │
                          └──────┬──────┘
                                 │ injects into
  ┌──────────────┐    ┌──────────▼──────────┐    ┌──────────────────────┐
  │  workspace.ts │    │  release-set.ts     │    │  adoption.ts         │
  │  discover pkgs│───▶│  create + validate  │    │  validateAdoption()  │
  └──────────────┘    │  set snapshots      │    │  (gap A + gap B)     │
                       └──────────┬──────────┘    └──────────┬───────────┘
                                  │                           │
                                  └─────────┬─────────────────┘
                                            │
                                     ┌──────▼──────┐
                                     │  decide.ts   │
                                     │  findings →  │
                                     │  ReleaseDecision
                                     └─────────────┘
```

**Key seam — `ReleaseHost`** (`src/host.ts`):

```typescript
interface ReleaseHost {
  listFiles(roots: string[]): string[]
  readFile(path: string): string
  writeFile(path: string, content: string): void
  readTarballManifest(path: string): TarballManifest   // ← the forgery-detector
}
```

The Node implementation (`src/node-host.ts`) does `tar -xOf <tarball> package/package.json` via `child_process.execSync`. Tests inject `memHost()` (in-memory fixture) — no file system needed.

---

## 3. Core Data Model — Three Types to Know

**`ReleaseSet`** (`src/types.ts:43–61`) — the immutable bundle:
```typescript
{
  schema_version: 1,
  name: 'baseline',
  version: '2026.06.0',            // Calendar-versioned: YYYY.MM.N
  status: 'live',                  // 'draft' | 'approved' | 'live' | 'superseded'
  packages: { '@sys/canon': '1.0.0', '@sys/errors': '0.0.1', … },
  evidence: [{ source: 'pnpm-check', ref: 'passed' }],  // provenance
  owner?: string, approved_by?: string, expires_at?: string
}
```

**`AdoptionRecord`** (`src/types.ts:66–73`) — the consumer's claim (`sys.lock.json`):
```typescript
{
  schema_version: 1,
  product: 'qarar',
  adopts: { release_set: 'baseline@2026.06.0' },  // pointer to set
  packages: { '@sys/canon': '1.0.0', '@sys/errors': '0.0.1', … }
}
```

**`ReleaseDecision`** (`src/types.ts:92–99`) — the verdict:
```typescript
{
  decision: 'allow' | 'deny' | 'warn',
  subject: { type: 'adoption', id: 'qarar' },
  reasons: ReleaseFinding[],        // every issue found
  evidence: EvidenceRef[],
  decidedAt: '2026-06-14T…',
  policyVersion: 'release/1'
}
```

---

## 4. Contract Audit (The Sys Standard Conformance)

**Rule 1: Single Composition Root (`defineX()`)**
- ✅ **PASS** — `defineRelease(deps)` at `src/config.ts:12–14`
- Accepts `ReleaseSeams` (just `{ host: ReleaseHost }`), parses the empty schema, returns config.
- Empty schema is intentional: this package has no serialisable scalar config — the host seam IS the config.

**Rule 2: Zod-validated Config**
- ✅ **PASS** — Two schemas at `src/schemas.ts:8–40`
- `releaseSetSchema`: validates calendar version regex, semver package versions, status enum.
- `adoptionRecordSchema`: validates product name, packages (semver), optional modes enum.
- These are the **runtime source of truth** — the JSON schema files in `schema/` mirror them.

**Rule 3: Zero App-Specific Imports**
- ✅ **PASS** — Imports across all 10 source files: `zod`, `node:fs`, `node:path`, `node:child_process` only.
- `node:*` stdlib is confined to `node-host.ts` (the seam implementation) — not in the pure core.
- Zero product imports. Governance contract mirrored from `@eng/governance` — independently defined, not imported.

**Rule 4: Ships `dist/` + `bin`**
- ✅ **PASS** — `package.json:8–29`; `tsup.config.ts:4–16`
- Three entry points: `index` (lib), `node-host` (seam), `cli` (bin: `sys-release`).
- `schema/` directory also shipped (in `"files": ["dist", "schema"]`).
- `"bin": { "sys-release": "./dist/cli.js" }` — the R8 CLI entry.

**Rule 5: Classified in `taxonomy.yaml`**
- ✅ **PASS** — Entry at `taxonomy.yaml:930–972`
- `id: sys-release`, `primary_plane: governance`, `cross_runtime: true`, `test_profile: full`.
- 6 modules documented with plane + role. `status: active`.

---

## 5. The `decide()` Function — How Verdicts Are Reached

**`decide()` at `src/decide.ts:16–30` — the simplest function in the package:**

```typescript
const blocking = findings.some(
  f => f.severity === 'blocker' || (strict === true && f.severity === 'warning')
)
const warned   = findings.some(f => f.severity === 'warning')
const decision = blocking ? 'deny' : warned ? 'warn' : 'allow'
```

**Finding severity map** (from validation functions):

| Finding code | Severity | Trigger |
|---|---|---|
| `release_set_version_mismatch` | blocker | Lock claims version X; set says Y |
| `adoption_package_missing` | blocker | Package in lock not found in any manifest |
| `adoption_release_set_mismatch` | blocker | Lock's `adopts.release_set` ≠ actual set |
| `tarball_metadata_mismatch` | blocker | Tarball internal version ≠ lock version |
| `tarball_dep_unsatisfiable` | warning | Transitive `@sys` dep inside tarball has no resolution path |
| `evidence_not_recorded` | warning | `live` set has no evidence entries |
| `release_set_stale` | warning | `expires_at` is in the past |

**`--strict` mode** (used by CI): promotes all `warning` → `deny`. Zero warnings allowed.

---

## 6. Tests & Gaps

`pnpm --filter @sys/release test` — ~50 cases across 15 files.

| Category | Files | What's covered |
|---|---|---|
| Unit | `decide`, `adoption`, `release-set`, `workspace`, `negative-schema`, `negative-input` | All pure functions; schema rejection; malformed input |
| Integration | `integration-drift`, `integration-pipeline` | Version bump detection; full create→validate→adopt pipeline |
| E2E | `e2e-attestation`, `e2e-attestation-deny` | Clean allow; forged tarball deny; missing tarball deny |
| Governance | `governance-policy`, `governance-freshness` | Verdict ladder; expired sets; evidence-less live sets |
| Adversarial | `adversarial-drift`, `adversarial-protocol` | Drifted claim deny; forged version deny; swapped package deny |

**What is deliberately out of scope** (documented in `docs/design.md:45–53`):
- Version bump computation (Changesets)
- Changelog generation
- npm publish
- Node-fs integration test against real tarballs (the seam pattern handles this — `memHost()` covers the logic)

**One open follow-up** (`docs/design.md:55`):
- JSON Schema files (`schema/`) are hand-mirrored from Zod schemas. A build step that auto-generates them would close a potential drift gap. A test currently asserts Zod accepts the schema examples, but doesn't assert the JSON Schema matches Zod exactly.

---

## 7. Associated Artifact — Live Release Set Demo

**The demo in three commands** (run from the monorepo root):

```bash
# 1. Snapshot the current workspace (dry run — prints JSON)
node packages/release/dist/cli.js set create --name baseline

# 2. Save it
node packages/release/dist/cli.js set create --name baseline --write

# 3. Validate — shows ALLOW with 0 findings
node packages/release/dist/cli.js set validate
```

**Actual output of command 1 (captured 2026-06-14):**
```json
{
  "schema_version": 1,
  "name": "baseline",
  "version": "2026.06.0",
  "status": "live",
  "packages": {
    "@eng/governance": "1.0.0",
    "@eng/workflow": "0.0.1",
    "@sys/assay": "0.3.0",
    "@sys/atlas": "0.0.1",
    "@sys/auth": "0.0.1",
    "@sys/canon": "1.0.0",
    "@sys/errors": "0.0.1",
    "@sys/release": "0.0.4"
  },
  "evidence": [{ "source": "pnpm-check", "ref": "passed" }],
  "created_at": "2026-06-14T14:57:40.083Z"
}
(dry-run; pass --write to save to .releases/sets/baseline-2026.06.0.json)
```

**BLOCK scenario** — to show a deny decision live, edit one package version in `.releases/sets/baseline-2026.06.0.json` after writing it (simulating workspace drift), then re-run `set validate`. The output will show a `release_set_version_mismatch` blocker and exit code 1.

A sample adoption lock for the demo is at `packages/release/docs/sample-sys.lock.json`.

---

## 8. Lessons & Connection Points

- **`@sys/release` ↔ `@sys/checkpoint`**: `checkpoint` gates the git tree (clean tree, protected branch); `release` gates the package versions. Two consecutive governance checkpoints before anything ships.
- **`@sys/release` ↔ `@sys/gatekeeper`**: A promotion ALLOW from `gatekeeper` could include a `release` attestation as evidence — "the versions match and `pnpm-check` passed" is the kind of evidence `gatekeeper` needs to grant an ALLOW verdict.
- **The immutability invariant**: Once a set is `live`, it must not change. The package itself doesn't enforce this — the CI gate and repo permissions do. The study surfaces this as a human protocol, not a code guarantee.
- **Calendar versioning (`YYYY.MM.N`)**: Release sets use calendar versions, not semver. This is deliberate — a release set is a snapshot in time, not an API contract. Semver applies to individual packages; calver applies to the bundle.
