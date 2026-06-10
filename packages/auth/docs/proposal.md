# sys-auth — Build proposal (5-plane architecture)

**Status:** Proposal · **Date:** 2026-06-03 · **Companion to:** `sys-auth-spec.md`,
`sys-auth-current-state.md`

sys-auth is a **Control-plane subsystem** — a configurable, reusable authentication &
authorization component. Its identity is Control: establish principal, tenant, and
permission context, then decide what may proceed. It **integrates with the other four
planes through injected seams — it does not own them** (Data = backend adapter,
Observability = event sink, Governance = permission model, Recovery = session policy).

We build around the 5-plane architecture always, so the planes are the organizing frame
for everything below: package layout, interfaces, config, security, and rollout all map
back to them. Each app also enables only the subset of methods it needs (unused methods
aren't bundled).

---

## 0. Resolved decisions (2026-06-03)

- **Scope = end-user authentication** (human → web/API app). NOT cadre-os's machine
  connector-OAuth (separate system).
- **Reuse:** shared across TS apps (Qarar now; mongu, a future cadre-os console later).
  No concrete second consumer yet.
- **Home:** standalone repo `~/projects/sys/` (pnpm monorepo of `@sys/*` subsystems),
  decided 2026-06-03. `@sys/auth` is the first package. (Superseded the earlier
  "build inside Qarar first" lean — chose a dedicated reusable-components home up front.)
- **Discipline (keeps promotion cheap):** imports nothing from `apps/*` or `@qarar/shared`
  (permissions injected via config); own deps; generic name **`@sys/auth`** from day one;
  CI guard blocks app-path imports; promotion trigger = first 2nd consumer.
- **Backend:** Supabase adapter only, behind a swappable interface.
- **Methods:** passwordless-primary (Google/Apple/magic-link prominent), keep
  email+password as fallback; WhatsApp/phone OTP fast-follow.

---

## 1. Architecture — a Control-plane subsystem

sys-auth **is a Control-plane subsystem.** It *owns* the Control plane and *integrates
with* the other four via injected seams — it never owns them. This keeps it "squarely
control" while avoiding the monolithic "auth blob" (policy, SDK calls, redirects,
telemetry, retries, UI state all collapsed into one thing).

**Owned — Control plane (the decision surface):**

| Concern | sys-auth surface |
|---|---|
| Principal identity, session resolution | `server` (getUser), `react` session state |
| Tenant / country resolution | `tenancy.resolve` (Control) → entitlement verified via Governance |
| The normalized decision contract | `server`: `requireAuth`, `requirePermission`; `core/contract` |
| Routing decision (UX only, never authz) | `middleware` |
| Enabled-method registry | `methods` config (Control); execution delegated to Data |

**Integrated — the other four planes, via injected seams (host owns them):**

| Plane | Seam sys-auth exposes | Host provides |
|---|---|---|
| **Data** | `AuthBackend` adapter interface | the Supabase adapter (JWT verify, cookie/session IO, OAuth, method calls) |
| **Governance** | `roles.permissions` + policy hooks | the permission model (e.g. `@qarar/shared`) + verification policy |
| **Observability** | `observability.sink` | the app's logger/Sentry that receives structured auth events |
| **Recovery** | `session` policy + state-machine hooks | thresholds (idle timeout) + how forced re-auth surfaces in the app |

So the package is unambiguous: **Control is owned; the rest are integration points.** A
host system slots sys-auth into its Control plane and wires its own Data/Governance/
Observability/Recovery planes into the seams.

### Plane invariants (carried into the package as enforced rules)
- **Control:** the only place an authorization decision is made is server-side
  (`requirePermission`). Web middleware participates in Control as **routing only** — it
  reads session but never branches on authorization.
- **Governance:** JWKS-first verification; client `can()` is a UX affordance, never truth;
  provisioning is server-authoritative (DB trigger / server bootstrap), never client.
- **Data:** clients are request-scoped, never module-scoped; cookies/tokens are read via
  the provider SDK, never hand-rolled.
- **Observability:** every auth decision and failure emits a structured event.
- **Recovery:** no auth-state transition is silent; expiry/refresh/forced-signout are
  explicit states.

## 2. Package layout (mapped to planes)

```
packages/sys-auth/
├── core/
│   ├── contract.ts     [Control+Governance]  AuthUser, ResolvedRole, PermissionCheck,
│   │                                          TenantContext, AuthMethodDescriptor — types only, no transport
│   ├── policy.ts        [Governance]          verification policy, invariants, required claims
│   └── config.ts        [Control]             defineAuth() + zod schema (the composition root)
├── server/              [Control+Data]        createServerAuth: getUser, requireAuth, requirePermission
├── middleware/          [Control]             createAuthMiddleware: routing-only session read (SDK)
├── react/               [Control+Recovery+Obs] createClientAuth: AuthProvider, useAuth,
│                                              useSignIn (headless method list + handlers), state machine
├── methods/             [Control reg + Data exec]  per-entry-point, side-effect-free ESM:
│   ├── method-national-id.ts @sys/auth/method-national-id  (UAE Pass/Singpass/… — auth + KYC)
│   ├── method-passkey.ts    @sys/auth/method-passkey   (WebAuthn)
│   ├── method-oauth.ts      @sys/auth/method-oauth
│   ├── method-magiclink.ts  @sys/auth/method-magiclink
│   ├── method-otp.ts        @sys/auth/method-otp
│   └── method-password.ts   @sys/auth/method-password
│
│   useSignIn() (react) = the headless UI extraction: buildSignInMethods(config, backend)
│   gives the app the available methods + bound handlers; the app renders its OWN buttons.
│   The package ships logic, not markup (not a UI kit).
│
│   ALL methods are first-class + fully supported. Each consuming app enables a SUBSET via
│   config — e.g. Qarar omits `passwordMethod` (fully passwordless), another app might use
│   only `passwordMethod`. The package never assumes a policy.
│   NOTE: passkey descriptor + `client.passkey` capability (register/authenticate/isSupported)
│   are in place; the WebAuthn ceremony itself is the backend adapter's TODO (e.g. via
│   @simplewebauthn or the provider's native passkey support).
├── observability/       [Observability]       event types + injectable sink
└── adapters/
    └── supabase.ts      [Data]                AuthBackend impl
```

`"sideEffects": false`; each method is its own subpath export → "not imported = not
bundled" actually holds (declarative descriptors, no hidden global registry).

## 3. Configurability — composing the planes per app

One isomorphic config (no secrets) is the **Control-plane composition root**. It wires the
method registry (Control), the permission model (Governance), session policy (Recovery),
tenancy (Control resolution + Governance entitlement), and the backend (Data).

```ts
// app/auth.config.ts — isomorphic, NO secrets, shared by all surfaces
import { defineAuth } from '@sys/auth'
import { passwordMethod } from '@sys/auth/method-password'
import { oauthMethod }    from '@sys/auth/method-oauth'
import { magicLinkMethod } from '@sys/auth/method-magiclink'
import { permissions } from '@qarar/shared'        // injected (Governance), never imported by the pkg

export const authConfig = defineAuth({
  backend: 'supabase',                              // Data adapter
  methods: [                                        // Control registry — present = available & bundled
    passwordMethod(),
    oauthMethod({ google: true, apple: true }),
    magicLinkMethod(),
    // otpMethod({ channel: 'whatsapp' })           // omitted = not bundled
  ],
  primaryMethods: ['oauth', 'magicLink'],           // password kept but de-emphasized
  roles: { source: 'db', table: 'user_roles', permissions },   // Governance
  session: { idleTimeoutMs: 30*60_000, warnBeforeMs: 5*60_000 }, // Recovery
  tenancy: {                                        // Control resolve + Governance verify
    mode: 'per-country',
    resolve: (ctx) => ctx.country,                  // requested context
    // entitlement verified server-side against authoritative data, not the token
  },
  observability: { sink: appEventSink },            // Observability
})
```

A second app reuses sys-auth by writing its own config — drop password, add OTP, set
`tenancy.mode:'single'` — **zero package code changes**. Validated with zod.

## 4. The contract (Control + Governance, types only)

```ts
// core/contract.ts — consumed by server, client, middleware; no transport logic
type AuthUser       = { id: string; email?: string }
type ResolvedRole   = { role: Role; permissions: Permission[]; source: 'db' | 'claims' }
type TenantContext  = { requested: string; verified: boolean }      // Control + Governance
type Claims         = { sub: string; email?: string; role?: string; tenant?: string } // hint only
interface PermissionCheck { (perm: Permission): boolean }           // server truth vs client UX
interface AuthMethodDescriptor {
  id: 'password' | 'magicLink' | 'oauth' | 'otp'
  capability: keyof AuthBackend['client']
  ui: { label: string; order?: number }
}
```

## 5. The three surfaces (plane adapters from one config)

```ts
// server [Control+Data] — jose verification; JWKS default, HS256 = legacy flag
const auth = createServerAuth(authConfig, { jwtSecret })
auth.getUser(req)                 // verified claims or null (checks iss/aud/exp/sub, nbf/iat skew)
auth.requireAuth()                // 401 if unverified
auth.requirePermission(...perms)  // Control decision; one memoized server-side role provider

// middleware [Control, routing-only] — session via SDK, never hand-rolled, no authz branching
createAuthMiddleware(authConfig)

// react [Control+Recovery+Obs] — session state machine, idle policy, emits events
const { AuthProvider, useAuth } = createClientAuth(authConfig)
// useAuth(): { user, session, role, permissions, loading, can /*UX only*/, signIn, signOut }
```

`AuthBackend` (Data) interface stays as in the spec: `verifyToken`,
`getSessionFromCookies` (SDK), and a `client` capability map (password/magicLink/oauth/otp).
Request-scoped clients only.

## 6. Governance — security model & invariants

- **Authoritative boundary:** server verification (Control decision) + DB RLS. Middleware
  is routing-only, forever.
- **Verification:** `jose`; **JWKS/asymmetric default**, HS256 behind a compat flag; check
  `iss`/`aud`/`exp`/`sub` (+ `nbf`/`iat` skew); distinct *expired* vs *malformed* diagnostics.
- **Sessions:** request-scoped clients; `Cache-Control: private, no-store` on auth/refresh
  responses; PKCE for SSR sign-in (`@supabase/ssr` default).
- **Provisioning:** server-authoritative (DB trigger / bootstrap), never the React client.
- **Roles:** JWT = identity (+ coarse hint); DB/RLS authoritative; `requirePermission`
  resolves via one memoized server-side provider; client `can()` = UX only.
- **Tenancy:** resolver picks requested context; server verifies entitlement against
  authoritative data; JWT carries only a stable low-cardinality hint.
- **Public API:** explicitly semver-protected exports vs internal.

## 7. Observability & Recovery (first-class, not afterthoughts)

- **Observability:** an injectable event sink receives structured events — `signin.success`,
  `signin.failure`, `permission.denied`, `session.refresh_failed`, `cookie.invalid`,
  `method.used`, `session.expired`. The package emits; the app routes to its logger/Sentry.
- **Recovery:** the client is a state machine — `unauthenticated → authenticating →
  authenticated → refreshing → expired → signing-out → errored`. Idle-timeout, visibility
  revalidation, safe refresh/retry, malformed-session fallback, and forced re-auth are
  explicit transitions (no silent state changes, no god-object).

## 8. Phased build plan (each phase leaves Qarar working)

0. **Scaffold** — package, `core/contract` + `core/policy` + `defineAuth` (zod), test harness.
1. **Control+Data (server)** — port the solid `jose` verification + `requireAuth`/
   `requirePermission` into `@sys/auth/server`; API consumes it. Lowest risk.
2. **Control (middleware)** — replace hand-rolled parsing with SDK session read;
   routing-only; delete `decodeJwt`.
3. **Recovery+Control (react)** — wrap/slim `AuthProvider` into the state machine; move
   provisioning to the DB trigger (delete the client write).
4. **Methods + config** — declarative per-entry method plugins; app config drives UI.
5. **Observability** — wire the event sink throughout.
6. **Extract/publish** for the 2nd app; add WhatsApp `otpMethod`.

See `sys-auth-current-state.md` for the exact files, extraction seams, and what to delete
vs wrap per phase.

## 9. Open questions for perp

1. Cross-repo distribution at promotion: private npm registry vs GitHub Packages vs git tag.
2. Framework-agnostic core depth — keep minimal (server contract + client core + thin React
   binding) until a non-React UI exists?
3. Does the 5-plane decomposition hold cleanly for an *auth* subsystem, or does any concern
   straddle two planes awkwardly (e.g. tenancy = Control resolve + Governance verify — keep
   split, or unify)?
4. Anything in the Governance invariants to harden or challenge further.

---

*If aligned after perp: start Phase 0–1 (scaffold + port server verification) — highest
value, lowest risk, proves the package shape on real code.*
