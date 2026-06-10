# @sys/secrets

Secret-**reference** resolver: refs live in code, **values never do**. Extracted from cadre-os's
SYS-WARP Phase 7 secret mechanism (ADR-0040 / ADR-0073), ported to TS.

A `SecretRefs` manifest names where each secret comes from; the resolver materialises it at runtime:

```
Keychain (injected reader) → environment variable → missing (fail loud for required)
```

- **Local/dev**: values live in the **macOS Keychain** (`com.<namespace>.<provider>` / account = name) — no plaintext in any file.
- **CI / Vercel / prod**: no Keychain, so resolution falls through to **env vars** (platform-injected).
- A required secret that resolves nowhere **throws** — never a silent empty string.

## API

```ts
import { defineRefs, resolveAll, verifyRefs, expand, snapshotEntry } from '@sys/secrets'
import { keychainReader } from '@sys/secrets/keychain'

const refs = defineRefs({ kind: 'SecretRefs', secrets: {
  SUPABASE_SERVICE_ROLE_KEY: { provider: 'keychain', service: 'com.qarar.supabase', account: 'service_role', required: true },
}})

const opts = { reader: keychainReader(), namespace: 'qarar' }
const env = resolveAll(refs, opts)            // { SUPABASE_SERVICE_ROLE_KEY: '…' } or throws
const status = verifyRefs(refs, opts)         // [{ name, source, required }] — NO values (safe to log)
const url = expand('${SUPABASE_URL}/rest', refs, opts)
const snap = snapshotEntry('SUPABASE_SERVICE_ROLE_KEY', refs, opts) // { name, ref, fingerprint } — never the value
```

## Design
- **Pure core + injected reader.** `core.ts` does no I/O — the Keychain read is the injected
  `SecretReader` (`./keychain` provides the macOS `security`-backed one). Deterministic under test.
- **Snapshot-safe.** `snapshotEntry` emits `{ name, ref, fingerprint: 'sha256:…' }` — a config snapshot
  can identify + change-detect a secret without ever serialising the value.
- **Provider convention.** When a ref omits `service`/`account`, they default to
  `com.<namespace>.<providerOf(name)>` / `name`, where `providerOf` is the lowercased first token
  (`CLAUDE_*` → `anthropic`).

## Build
`pnpm build` (tsup, ESM+CJS+dts) · `pnpm test` (vitest) · `pnpm typecheck`. No runtime deps.
