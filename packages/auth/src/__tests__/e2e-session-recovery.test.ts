// E2E (path_kind: recovery) — the FAILURE-then-RECOVERY arm of the full session
// lifecycle, traversed end-to-end through the public API:
//
//   1. authenticated session established from a real verified token
//   2. the token lapses → server re-verification FAILS at the Data seam (expired)
//   3. the in-flight refresh fails → sessionReducer drives the machine to 'expired'
//   4. RECOVERY: the user signs in afresh (real new token) → verify → authorize → grant
//      → sessionReducer returns the machine to a live 'authenticated' session
//
// Asserts the system fails closed when a credential lapses AND can be cleanly re-driven
// back to an authorized session — the lapse is a distinct terminal state, not a crash.

import { describe, it, expect } from 'vitest'
import { SignJWT } from 'jose'
import { createSupabaseVerifier } from '../server/verify'
import { createServerAuth } from '../server/index'
import {
  initialSessionState,
  sessionReducer,
  isAuthenticated,
  type SessionState,
} from '../client/session-machine'
import type { PermissionModel, RoleResolver } from '../core/contract'

const SECRET = 'e2e-recovery-secret-at-least-32-chars-long-x'
const key = new TextEncoder().encode(SECRET)
const USER = { id: 'cust-9', email: 'cust-9@b.com' }

function mintToken(expSec: number): Promise<string> {
  return new SignJWT({ email: USER.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('authenticated')
    .setIssuedAt()
    .setSubject(USER.id)
    .setExpirationTime(expSec)
    .sign(key)
}
const now = () => Math.floor(Date.now() / 1000)

const verifier = createSupabaseVerifier({ supabaseUrl: 'http://localhost:54321', hs256Secret: SECRET })
const roles: RoleResolver = {
  async resolve(id) {
    return id === USER.id ? { role: 'client', permissions: [], source: 'db' } : null
  },
}
const permissions: PermissionModel = {
  hasAnyPermission: (role, required) => role === 'client' && required.every((r) => r.startsWith('client.')),
}
const serverAuth = createServerAuth({ verifier, roles, permissions })

describe('e2e: full session lifecycle, failure → recovery traversal', () => {
  it('a live session lapses (expired token) then recovers via a fresh sign-in', async () => {
    // ── 1. Establish a live authenticated session from a valid token.
    const firstToken = await mintToken(now() + 3600)
    const grant = await serverAuth.authorize(firstToken, 'client.read')
    expect(grant.ok).toBe(true)

    let state: SessionState = sessionReducer(
      sessionReducer(initialSessionState, { type: 'bootstrapped', user: null }),
      { type: 'sign_in_success', user: USER },
    )
    expect(state.status).toBe('authenticated')
    expect(isAuthenticated(state)).toBe(true)

    // ── 2. The token lapses. A refresh attempt re-verifies an EXPIRED token server-side.
    state = sessionReducer(state, { type: 'refresh_start' })
    expect(state.status).toBe('refreshing')

    const expiredToken = await mintToken(now() - 3600)
    const reverify = await serverAuth.authorize(expiredToken, 'client.read')
    // Fail closed at the Data seam — an expired credential is unauthenticated (401).
    expect(reverify).toMatchObject({ ok: false, status: 401, reason: 'unauthenticated' })

    // ── 3. The failed refresh drives the machine to the distinct 'expired' state.
    state = sessionReducer(state, { type: 'refresh_error' })
    expect(state.status).toBe('expired')
    expect(state.user).toBeNull()
    expect(isAuthenticated(state)).toBe(false)

    // ── 4. RECOVERY: the user signs in again; a fresh token verifies and authorizes.
    state = sessionReducer(state, { type: 'sign_in_start' })
    expect(state.status).toBe('authenticating')

    const recoveryToken = await mintToken(now() + 3600)
    const regrant = await serverAuth.authorize(recoveryToken, 'client.read')
    expect(regrant.ok).toBe(true)
    if (regrant.ok) expect(regrant.user.id).toBe(USER.id)

    state = sessionReducer(state, { type: 'sign_in_success', user: USER })
    expect(state.status).toBe('authenticated')
    expect(isAuthenticated(state)).toBe(true)
  })

  it('an explicit expire on a live session also reaches the distinct expired terminal state', async () => {
    const token = await mintToken(now() + 3600)
    expect((await serverAuth.authorize(token, 'client.read')).ok).toBe(true)

    let state: SessionState = { status: 'authenticated', user: USER }
    state = sessionReducer(state, { type: 'expire' })
    expect(state.status).toBe('expired')
    // Distinct from a clean sign-out, which lands on 'unauthenticated'.
    const signedOut = sessionReducer(
      sessionReducer({ status: 'authenticated', user: USER }, { type: 'sign_out_start' }),
      { type: 'sign_out_done' },
    )
    expect(signedOut.status).toBe('unauthenticated')
  })
})
