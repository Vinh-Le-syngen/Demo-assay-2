# `@sys/*` / `@eng/*` Conformance Matrix

> Generated 2026-06-13 — `node scripts/check-conformance.mjs` to refresh.

**Legend:** ✅ PASS · ❌ FAIL (MUST unmet) · ℹ️ INFO (SHOULD unmet, non-blocking) · — N/A

> **R1, R3, R4, R5, R6** are machine-enforced by `pnpm check` (boundaries · taxonomy · build · typecheck · tests · assay). All packages pass — columns omitted.
> **R2** MUST: single `define<Pascal>()` export + Zod validation in `src/`.
> **R7** MUST: `README.md` + row in root `README.md` table. SHOULD: `docs/` directory (INFO if absent).
> **R8** applies only when `cross_runtime: true` in `taxonomy.yaml`; all others are N/A.

| Package | R2: Zod Root | R7: Docs | R8: Cross-Runtime |
|---------|:---:|:---:|:---:|
| `@sys/auth` | ✅ | ✅ | — |
| `@sys/assay` | ✅ | ✅ | ✅ |
| `@sys/warp` | ✅ | ℹ️ | ✅ |
| `@sys/sentinel` | ✅ | ℹ️ | ✅ |
| `@sys/backup` | ✅ | ℹ️ | ✅ |
| `@sys/groundskeeper` | ✅ | ℹ️ | ✅ |
| `@sys/warden` | ✅ | ℹ️ | ✅ |
| `@sys/herald` | ✅ | ℹ️ | — |
| `@sys/atlas` | ✅ | ℹ️ | ✅ |
| `@sys/checkpoint` | ✅ | ℹ️ | ✅ |
| `@sys/consent` | ✅ | ℹ️ | — |
| `@sys/gatekeeper` | ✅ | ℹ️ | ✅ |
| `@sys/pay` | ✅ | ℹ️ | — |
| `@sys/billing` | ✅ | ℹ️ | — |
| `@sys/vault` | ✅ | ℹ️ | — |
| `@sys/model-router` | ✅ | ✅ | — |
| `@sys/rag` | ✅ | ✅ | — |
| `@sys/dialog` | ✅ | ✅ | — |
| `@sys/canon` | ✅ | ✅ | — |
| `@eng/governance` | ✅ | ℹ️ | ✅ |
| `@eng/workflow` | ✅ | ℹ️ | — |
| `@sys/release` | ✅ | ✅ | ✅ |
| `@sys/errors` | ✅ | ℹ️ | — |
| `@sys/telemetry` | ✅ | ℹ️ | — |
| `@sys/reporting` | ✅ | ℹ️ | — |
| `@sys/secrets` | ✅ | ℹ️ | — |
| `@sys/chat` | ✅ | ✅ | ✅ |

---

## FAIL Details

*No failures — all normative MUST requirements met.*
## INFO Items (unmet SHOULDs — non-blocking)

**`@sys/warp`**
- R7: SHOULD: no docs/ directory

**`@sys/sentinel`**
- R7: SHOULD: no docs/ directory

**`@sys/backup`**
- R7: SHOULD: no docs/ directory

**`@sys/groundskeeper`**
- R7: SHOULD: no docs/ directory

**`@sys/warden`**
- R7: SHOULD: no docs/ directory

**`@sys/herald`**
- R7: SHOULD: no docs/ directory

**`@sys/atlas`**
- R7: SHOULD: no docs/ directory

**`@sys/checkpoint`**
- R7: SHOULD: no docs/ directory

**`@sys/consent`**
- R7: SHOULD: no docs/ directory

**`@sys/gatekeeper`**
- R7: SHOULD: no docs/ directory

**`@sys/pay`**
- R7: SHOULD: no docs/ directory

**`@sys/billing`**
- R7: SHOULD: no docs/ directory

**`@sys/vault`**
- R7: SHOULD: no docs/ directory

**`@eng/governance`**
- R7: SHOULD: no docs/ directory

**`@eng/workflow`**
- R7: SHOULD: no docs/ directory

**`@sys/errors`**
- R7: SHOULD: no docs/ directory

**`@sys/telemetry`**
- R7: SHOULD: no docs/ directory

**`@sys/reporting`**
- R7: SHOULD: no docs/ directory

**`@sys/secrets`**
- R7: SHOULD: no docs/ directory

