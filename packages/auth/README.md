# @sys/auth

Control-plane authentication & authorization subsystem: establishes principal, session, tenant, and permission context and decides what may proceed.

**Plane:** control (primary), governance, data, observability, recovery  ·  part of the `@sys/*` reusable-subsystem monorepo.

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@sys/auth": "file:vendor/sys-auth-0.0.1.tgz"
```

## API

- `defineAuth(config): AuthConfig` — composition root; validates/normalizes the app's auth config (backend, methods, roles, session, tenancy).
- `createServerAuth(deps): ServerAuth` (`@sys/auth/server`) — the decision surface: `authenticate(token)` and `authorize(token, ...perms)`. `bearer(header)` extracts the token.
- `createClientAuth(deps)` (`@sys/auth/react`) — returns `{ AuthProvider, useAuth, useSignIn }` over the pure session machine.
- `createAuthMiddleware(cfg): AuthMiddleware` (`@sys/auth/middleware`) — routing-only `decide(path, request)` redirect gate (no authz branching).
- Method plugins (declarative `AuthMethodDescriptor` builders, each its own subpath): `passkeyMethod` (`/method-passkey`), `oauthMethod` (`/method-oauth`), `magicLinkMethod` (`/method-magiclink`), `otpMethod` (`/method-otp`), `passwordMethod` (`/method-password`), `nationalIdMethod` (`/method-national-id`).
- `createSupabaseVerifier(cfg)`, `createSupabaseRoleResolver(cfg)`, `createUserClient(url, anonKey, jwt)` (`@sys/auth/adapters/supabase`) — the Data-plane backend (token verify, role lookup, request-scoped RLS client).
- `AuthEvent`, `AuthEventSink`, `noopSink` (`@sys/auth/observability`) — the injectable telemetry seam.
- Contract types (`@sys/auth/core`): `AuthUser`, `AuthzResult`, `TokenVerifier`, `RoleResolver`, `PermissionModel`.

## Usage

```ts
import { createServerAuth, bearer } from '@sys/auth/server'
import { createSupabaseVerifier, createSupabaseRoleResolver } from '@sys/auth/adapters/supabase'

const auth = createServerAuth({
  verifier: createSupabaseVerifier({ supabaseUrl, jwksUrl }),
  roles: createSupabaseRoleResolver({ supabaseUrl, serviceRoleKey, permissionsFor }),
  permissions: { hasAnyPermission: (role, req) => req.some((p) => can(role, p)) },
})

const result = await auth.authorize(bearer(req.headers.get('authorization')), 'documents:write')
if (!result.ok) return new Response(result.reason, { status: result.status })
```

## Extend via

Method plugins + a backend adapter (the injected verifier / role resolver / permission model / sink seams).
