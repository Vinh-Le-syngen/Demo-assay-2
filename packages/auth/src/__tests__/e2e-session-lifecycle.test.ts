// E2E (path_kind: happy) — a FULL session lifecycle traversed end-to-end through the
// package's public API, with no internal shortcuts:
//
//   1. sign-in surface       buildSignInMethods()  → the user picks an available method
//   2. backend method call   ClientBackend.passkey.authenticate() issues a real session token
//   3. token verification    createSupabaseVerifier().verify()  (real jose HS256 crypto)
//   4. authorization         createServerAuth().authorize()     → the Control grant
//   5. session establishment sessionReducer(sign_in_success)    → 'authenticated'
//   6. refresh               new token issued → re-verified → sessionReducer(refresh_success)
//
// This is the happy traversal: every stage succeeds and the verified principal is the
// same identity from method selection all the way to the live session state.

import { describe, it, expect } from 'vitest'
import { SignJWT } from 'jose'
import { buildSignInMethods } from '../client/sign-in'
import type { ClientBackend } from '../client/backend'
import type { AuthMethodDescriptor } from '../core/config'
import { createSupabaseVerifier } from '../server/verify'
import { createServerAuth } from '../server/index'
import {
  initialSessionState,
  sessionReducer,
  isAuthenticated,
  type SessionState,
} from '../client/session-machine'
import type { PermissionModel, RoleResolver } from '../core/contract'

const SECRET = 'e2e-secret-at-least-32-chars-long-padding-x'
const key = new TextEncoder().encode(SECRET)
const USER = { id: 'cust-1', email: 'cust-1@b.com' }

// An "auth backend" whose passkey authentication mints a real signed session token.
function mintToken(sub: string, expSec?: number): Promise<string> {
  return new SignJWT({ email: `${sub}@b.com` })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('authenticated')
    .setIssuedAt()
    .setSubject(sub)
    .setExpirationTime(expSec ?? Math.floor(Date.now() / 1000) + 3600)
    .sign(key)
}

let lastIssuedToken = ''
const backend: ClientBackend = {
  async getSession() {
    return null
  },
  onAuthStateChange() {
    return () => {}
  },
  async signOut() {},
  passkey: {
    isSupported: () => true,
    async register() {
      return USER
    },
    async authenticate() {
      lastIssuedToken = await mintToken(USER.id)
      return USER
    },
  },
}

const descriptors: AuthMethodDescriptor[] = [
  { id: 'passkey', capability: 'webauthn', ui: { label: 'Use a passkey', order: 0 } },
  // Configured but unavailable (no magic-link capability on this backend) → filtered out.
  { id: 'magicLink', capability: 'email', ui: { label: 'Email me a link', order: 1 } },
]

// Server-side Control wiring.
const verifier = createSupabaseVerifier({ supabaseUrl: 'http://localhost:54321', hs256Secret: SECRET })
const roles: RoleResolver = {
  async resolve(id) {
    return id === USER.id ? { role: 'client', permissions: [], source: 'db' } : null
  },
}
const permissions: PermissionModel = {
  hasAnyPermission(role, required) {
    return role === 'client' && required.every((r) => r.startsWith('client.'))
  },
}
const serverAuth = createServerAuth({ verifier, roles, permissions })

describe('e2e: full session lifecycle, happy traversal', () => {
  it('sign-in method → token → verify → authorize → session established → refresh', async () => {
    // ── 1. The sign-in surface offers only the available method, in order.
    const methods = buildSignInMethods(descriptors, backend)
    expect(methods.map((m) => m.id)).toEqual(['passkey'])
    const chosen = methods[0]!
    expect(chosen.needsInput).toBe('none')

    // ── 2. Session bootstraps to unauthenticated (no existing session).
    let state: SessionState = sessionReducer(initialSessionState, {
      type: 'bootstrapped',
      user: await backend.getSession(),
    })
    expect(state.status).toBe('unauthenticated')

    // ── 3. The user invokes the chosen method; a real token is minted.
    state = sessionReducer(state, { type: 'sign_in_start' })
    expect(state.status).toBe('authenticating')
    const principal = await backend.passkey!.authenticate()
    expect(principal).toEqual(USER)
    expect(lastIssuedToken).not.toBe('')

    // ── 4. Server verifies the issued token and authorizes against a permission.
    const decision = await serverAuth.authorize(lastIssuedToken, 'client.read')
    expect(decision.ok).toBe(true)
    if (decision.ok) {
      // The authorized identity matches the principal returned by the method.
      expect(decision.user.id).toBe(principal.id)
      expect(decision.role.role).toBe('client')
    }

    // ── 5. The verified session is established in the client machine.
    state = sessionReducer(state, { type: 'sign_in_success', user: principal })
    expect(state.status).toBe('authenticated')
    expect(isAuthenticated(state)).toBe(true)

    // ── 6. Token refresh: a fresh token is minted, re-verified, session stays live.
    state = sessionReducer(state, { type: 'refresh_start' })
    expect(state.status).toBe('refreshing')
    const refreshed = await mintToken(USER.id)
    const reauthorized = await serverAuth.authorize(refreshed, 'client.read')
    expect(reauthorized.ok).toBe(true)
    state = sessionReducer(state, { type: 'refresh_success', user: USER })
    expect(state.status).toBe('authenticated')
    expect(isAuthenticated(state)).toBe(true)
  })
})
