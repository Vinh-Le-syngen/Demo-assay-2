# sys-auth — Configurable, reusable authentication system

**Status:** Draft for discussion
**Date:** 2026-06-03
**Owner:** Sinu
**Purpose:** A single, configurable auth component/package that supports all of our
authentication methods and is reusable across applications — not Qarar-specific.

---

## 1. Why

Today auth in Qarar works but is **scattered and hand-rolled** in the session layer:

- Three independent notions of "who is the user," none sharing code:
  - API: cryptographic `jose` verification (`apps/api/src/lib/auth.ts`) — solid.
  - Web middleware: **unverified** hand-rolled base64 JWT/cookie decode
    (`apps/web/src/middleware.ts`) — brittle; recently broke all auth because it
    didn't handle Supabase's `base64-` cookie format.
  - Web client: `AuthProvider` via `supabase.auth` + its own role fetch.
- Role resolution duplicated in 3 places.
- `AuthProvider` is a ~300-line god component (session + role + profile writes +
  idle-timeout UI + Sentry).
- Nothing is extractable/reusable for the other apps Sinu is building.

The **core is good** (verification + a shared roles/permissions package). sys-auth is
**consolidation + extraction**, not a rewrite.

## 2. Goals / non-goals

**Goals**
- One auth contract used by every consumer (web, api, future apps).
- Configurable: enable/disable auth methods per app via config, no code surgery.
- Method-agnostic: email/password, magic link, OAuth (Google, Apple), phone/WhatsApp
  OTP — all behind one interface.
- Reuse the provider's own session/cookie handling (no hand-rolled parsing — that
  bug class never returns).
- One authorization boundary, explicitly declared and documented.
- Tenant/country-aware (Qarar accounts are country-specific today; may go global —
  ADR-0006). Auth knows the scope without each app re-deriving it.
- Drop-in: a new app wires config + mounts middleware/provider and is done.

**Non-goals**
- Not a new identity provider. We wrap an existing backend (Supabase Auth today),
  but behind an interface so the backend is swappable.
- Not a UI kit. sys-auth ships headless logic + minimal optional primitives; apps own
  their look.

## 3. Principles

1. **One boundary.** The API (token verification) + database RLS are authoritative.
   Web middleware is **UX routing only** — never a security decision.
2. **Never hand-roll tokens/cookies.** Always go through the provider SDK
   (`@supabase/ssr`) for session/cookie reads.
3. **Config over code.** Which methods are on, session policy, role source, and
   tenancy are configuration, injected once.
4. **Single source of truth** for roles/permissions (today: `@qarar/shared`) and for
   role resolution (one function, used everywhere).
5. **Server-authoritative provisioning.** User/profile/role rows are created by DB
   triggers or a server route — never by a client component.

## 4. Shape

A standalone package — working name `@sys/auth` (or `@qarar/auth` if Qarar-scoped
first), structured so consumers import only what they need:

```
@sys/auth
├── core/         backend-agnostic contracts + types (User, Session, Role, AuthConfig)
├── server/       token verification, requireAuth/requirePermission, getUser  (Node/edge)
├── client/       framework hook (useAuth), session lifecycle, idle policy
├── middleware/   route-protection helper (UX routing; uses provider SDK to read session)
├── methods/      per-method adapters: password, magic-link, oauth, otp(whatsapp/phone)
└── adapters/     backend driver (supabase today; interface allows others)
```

`core` depends on nothing. `server`/`client`/`middleware` depend on `core` +
`adapters`. Apps depend on the package and pass an `AuthConfig`.

## 5. Configuration model (the configurable part)

```ts
// One object, injected per app. Drives everything.
interface AuthConfig {
  backend: 'supabase' /* | 'other' */            // pluggable adapter
  methods: {
    password?:  { enabled: boolean; minStrength?: number }
    magicLink?: { enabled: boolean }
    oauth?:     { google?: boolean; apple?: boolean }
    otp?:       { phone?: boolean; whatsapp?: boolean }   // future-ready
  }
  primaryMethods?: AuthMethod[]   // ordering / which are prominent in UI
  session: {
    idleTimeoutMs?: number        // e.g. 30 min
    warnBeforeMs?: number         // e.g. 5 min
    refreshStrategy?: 'sdk' | 'manual'
  }
  roles: {
    source: 'db' | 'claims'       // where role comes from
    table?: string                // e.g. 'user_roles'
    permissionsModule: unknown    // @qarar/shared today
  }
  tenancy?: {
    mode: 'single' | 'per-country' | 'global'
    resolve?: (ctx) => string     // derive tenant/country scope
  }
  boundary: 'api+rls'             // documents the authoritative layer
}
```

A second app reuses sys-auth by supplying its own `AuthConfig` — e.g. turn off
password, turn on WhatsApp OTP, set `tenancy.mode='single'`.

## 6. Public contract (stable API)

**Server (api / route handlers / edge):**
```ts
getUser(req): Promise<AuthUser | null>          // verified claims only
requireAuth(): Middleware                        // 401 if no verified user
requirePermission(...perms): Middleware          // 401/403 + attaches role
```

**Client (React, today):**
```ts
useAuth(): { user, session, role, permissions, loading, can(perm), signOut() }
```

**Middleware (web routing):**
```ts
authRouting(config): Middleware                  // redirect rules; reads session via SDK
```

**Methods (UI-agnostic):**
```ts
signIn.password(email, pw) | signIn.magicLink(email)
signIn.oauth('google'|'apple') | signIn.otp.request(phone) / verify(code)
```

## 7. Auth methods (all behind one interface)

| Method | Backend call | Notes |
|---|---|---|
| Email + password | Supabase password grant | Keep as fallback (launch decision: passwordless-primary, keep password) |
| Magic link | Supabase OTP email | Deliverability risk in-region — not the only method |
| Google | Supabase OAuth | |
| Apple | Supabase OAuth | Required if other social on iOS |
| Phone / WhatsApp OTP | Supabase phone OTP / WhatsApp Cloud API | **Strong regional fit (UAE/MENA); we already run WhatsApp Cloud API.** Future-ready, config-gated |

Adding/removing a method = flip a config flag. UI renders from `methods` + `primaryMethods`.

## 8. Security model

- **Verification:** every protected API call verifies the token signature (jose;
  HS256 secret or JWKS ES256/RS256), `aud`, `exp`, `sub`. (Already correct today.)
- **Boundary:** API + RLS authoritative. Web middleware is routing only and must read
  the session via the provider SDK, not by decoding tokens itself.
- **Provisioning:** DB trigger (`on_auth_user_created`) owns role/profile creation.
  Remove the client-side `investor_profiles` upsert from `AuthProvider`.
- **Test net:** an auth test suite (sign-in, signup→dashboard, role gating, expired
  token, malformed cookie) so regressions like the base64-cookie break fail CI, not
  production.

## 9. Migration from today (incremental, low-risk)

1. Extract verification + `requirePermission` into `@sys/auth/server` (API already
   close — mostly a move).
2. Replace web middleware's hand-rolled `getUserFromCookies`/`decodeJwt` with the
   provider-SDK session read (kills the bug class). Keep it routing-only.
3. Wrap `AuthProvider` as `@sys/auth/client`; slim it (session + idle UI only); move
   provisioning to the DB trigger.
4. Introduce `AuthConfig`; Qarar passes its config. Methods become config-gated.
5. Add the auth test suite.
6. Second app adopts by supplying its own `AuthConfig`.

## 10. Open questions (for discussion)

- Package home: Qarar-scoped first (`@qarar/auth`) then promote, or build standalone
  `@sys/auth` from day one? (Reuse target drives this.)
- Backend lock-in: stay Supabase-only behind the adapter, or design the adapter for a
  real second backend now?
- Tenancy: model country/tenant as a JWT claim, a DB lookup, or app config?
- OTP: is WhatsApp OTP a launch method or fast-follow?
- Does the client contract need to be framework-agnostic (beyond React) for the other
  apps you're building?

---

*Next step: review/discuss, decide scope + reuse target, then turn §9 into an ADR +
implementation plan.*
