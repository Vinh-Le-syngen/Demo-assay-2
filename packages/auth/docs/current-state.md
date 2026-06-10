# sys-auth — Current-state code findings

**Status:** Review appendix · **Date:** 2026-06-03 · **Companion to:** `sys-auth-proposal.md`

The existing Qarar auth code, mapped to extraction seams and a **delete / port / wrap /
replace** verdict per file. This is the migration substrate for Phases 1–3.

---

## Inventory + verdict

| File | Responsibility | Plane | Verdict |
|---|---|---|---|
| `apps/api/src/lib/auth.ts` | `jose` token verification (HS256 + JWKS), `getAuthUser` | Data/Control | **PORT** to `@sys/auth/server` ~as-is — this is the gold standard |
| `apps/api/src/middleware/requirePermission.ts` | role lookup + permission gate, `requireAuth` | Control/Governance | **PORT** — already the target shape; generalize role source |
| `apps/api/src/lib/supabase.ts` | `supabaseAdmin` (service role) + `createUserClient(jwt)` (RLS) | Data | **WRAP** in the Supabase adapter; keep request-scoped `createUserClient` |
| `apps/web/src/middleware.ts` → `getUserFromCookies` / `decodeJwt` | hand-rolled cookie/JWT decode for routing | Control(misplaced) | **REPLACE** with SDK session read; **DELETE** `decodeJwt` |
| `apps/web/src/lib/supabase-server.ts` | `createServerClient` (correct cookie handling) | Data | **KEEP / REUSE** — this is what middleware should have used |
| `apps/web/src/lib/supabase.ts` | browser `createBrowserClient` | Data | **WRAP** in adapter `client` capabilities |
| `apps/web/src/components/AuthProvider.tsx` | session + role + **profile writes** + idle UI + Sentry | Control/Recovery (god object) | **SPLIT**: wrap session/idle into `@sys/auth/react`; **DELETE** the `investor_profiles` upsert |
| `@qarar/shared` permissions/roles | permission model | Governance | **KEEP**, inject via config (package never imports it) |
| DB trigger `on_auth_user_created_add_role` | auto-creates `user_roles` | Data/Control | **KEEP + EXTEND** to also provision `investor_profiles` |

---

## The good seam — API verification (PORT, don't touch logic)

`apps/api/src/lib/auth.ts` is already what the package should expose. It verifies both
signing modes and builds the user from **verified** claims:

```ts
// verifyToken: HS256 (secret) OR JWKS (ES256/RS256), audience 'authenticated', exp enforced
const alg = decodeProtectedHeader(token).alg
if (alg === 'HS256') ({ payload } = await jwtVerify(token, hs256Key(), opts))
else                 ({ payload } = await jwtVerify(token, JWKS, opts))   // ← make this the default
if (!payload.sub) return null
// getAuthUser → c.set('supabase', createUserClient(token))  (request-scoped, RLS)
```

Extraction = move file to `packages/sys-auth/src/server/`, swap the direct
`createUserClient` import for the injected adapter. Per perp: make JWKS the default,
demote HS256 to a compat flag, and add `iss`/`nbf`/`iat` checks.

## The bad seam — web middleware (REPLACE, DELETE decodeJwt)

`apps/web/src/middleware.ts` re-implements cookie + JWT parsing by hand and (until the
fix today) couldn't read Supabase's `base64-` cookie. It also **base64-decodes the JWT
without verifying the signature** — fine for routing, dangerous if ever trusted:

```ts
function decodeJwt(token: string) {                  // ← DELETE
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())  // NO signature check
  if (payload.exp * 1000 < Date.now()) return null
  return { id: payload.sub, email: payload.email }
}
```

Replace `getUserFromCookies` with a session read through `createServerClient`
(already present in `supabase-server.ts`) so the cookie format is the SDK's problem,
not ours. Keep middleware **routing-only** — no authorization branching ever.

## The god object — AuthProvider (SPLIT + DELETE the write)

`apps/web/src/components/AuthProvider.tsx` (~300 lines) mixes five concerns. The one to
**delete outright** is client-side provisioning:

```ts
// ensureProfile() — runs in the React provider on every auth change:
const { data: profile } = await supabase.from('investor_profiles').select('id').eq('id', user.id)…
if (!profile) await supabase.from('investor_profiles').upsert({ id: user.id, email: user.email, … })  // ← DELETE
```

The DB trigger already owns `user_roles`; extend it (or a server bootstrap endpoint) to
create `investor_profiles` for client-role users, then remove this write. What **wraps**
into `@sys/auth/react`: the `onAuthStateChange` bootstrap, idle-timeout timers + warning
modal, visibility revalidation, `signOut`/`localSignOut`, `can()`. Map those to the
client state model (`authenticating → authenticated → refreshing → expired → …`).

## Role resolution — collapse 3 copies into 1

Role is fetched independently in: `AuthProvider.ensureProfile` (web client),
`requirePermission` (api), and the admin/agent branch inside `middleware.ts`. Replace
with **one server-side role provider** (per-request memoized) behind the contract;
client `can()` becomes UX-only.

---

## Migration ordering (maps to proposal §7)

1. **Phase 1 (server):** port `auth.ts` + `requirePermission.ts` → `@sys/auth/server`;
   API switches imports. No behavior change. Net new risk: ~zero.
2. **Phase 2 (middleware):** replace `getUserFromCookies`, delete `decodeJwt`; middleware
   reads session via SDK. Risk: routing regressions — covered by the auth test suite
   (incl. a `base64-` cookie case, the exact bug we hit).
3. **Phase 3 (react):** wrap AuthProvider into `@sys/auth/react`; delete the
   `investor_profiles` upsert; extend the trigger. Risk: provisioning gap — verify
   new-signup creates both rows server-side before deleting the client write.

## What gets deleted (not wrapped)
- `decodeJwt` in `middleware.ts` (unverified, redundant once SDK reads the session).
- `getUserFromCookies` hand-rolled parsing (replaced by SDK).
- `ensureProfile`'s `investor_profiles` upsert (moves to DB trigger/server).
- Duplicate role-fetch logic in 2 of the 3 sites.

## What stays as-is
- `supabase-server.ts` `createServerClient` (correct already; the package reuses it).
- `createUserClient(jwt)` request-scoping pattern (matches perp's "request-scoped, not
  module-scoped" guidance).
- `@qarar/shared` permission model (injected, never imported by the package).
- The `on_auth_user_created_add_role` trigger (extended, not replaced).
