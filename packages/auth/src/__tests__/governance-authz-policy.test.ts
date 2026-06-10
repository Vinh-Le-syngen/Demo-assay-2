// Governance (compliance) — the authz POLICY contract. Asserts that the Control surface
// faithfully enforces the injected PermissionModel: role→permission mapping, the
// any-of (not all-of) semantics of required permissions, and capability gating. This
// pins the policy CONTRACT, independent of any particular app's role table.

import { describe, it, expect } from 'vitest'
import { createServerAuth } from '../server/index'
import type { PermissionModel, RoleResolver, TokenVerifier } from '../core/contract'
import type { AuthEvent, AuthEventSink } from '../observability/index'

const verifier: TokenVerifier = {
  async verify(token) {
    return token.startsWith('tok:')
      ? { ok: true, claims: { sub: token.slice(4) } }
      : { ok: false, reason: 'invalid_signature' }
  },
}

// Authoritative role table keyed by user id (Governance owns this mapping).
const USER_ROLE: Record<string, string> = {
  alice: 'admin',
  bob: 'agent',
  carol: 'client',
}
const roles: RoleResolver = {
  async resolve(userId) {
    const role = USER_ROLE[userId]
    return role ? { role, permissions: [], source: 'db' } : null
  },
}

// The app permission model: role → granted capabilities.
const ROLE_PERMS: Record<string, string[]> = {
  admin: ['admin.read', 'admin.write', 'agent.read'],
  agent: ['agent.read', 'agent.write'],
  client: ['client.read'],
}
const permissions: PermissionModel = {
  hasAnyPermission(role, required) {
    const granted = ROLE_PERMS[role] ?? []
    return required.some((r) => granted.includes(r))
  },
}

function withSink() {
  const events: AuthEvent[] = []
  const sink: AuthEventSink = { emit: (e) => events.push(e) }
  return { events, sink }
}

describe('governance: role→permission mapping contract (authz-policy)', () => {
  const auth = createServerAuth({ verifier, roles, permissions })

  it('grants exactly the capabilities mapped to each role', async () => {
    expect(await auth.authorize('tok:alice', 'admin.write')).toMatchObject({ ok: true })
    expect(await auth.authorize('tok:bob', 'agent.write')).toMatchObject({ ok: true })
    expect(await auth.authorize('tok:carol', 'client.read')).toMatchObject({ ok: true })
  })

  it('denies a capability outside the role mapping (no implicit grant)', async () => {
    // client must not reach admin or agent capabilities.
    expect(await auth.authorize('tok:carol', 'admin.read')).toMatchObject({
      ok: false,
      status: 403,
      reason: 'forbidden',
    })
    expect(await auth.authorize('tok:carol', 'agent.write')).toMatchObject({
      ok: false,
      status: 403,
    })
  })

  it('enforces ANY-OF semantics: one matching permission suffices', async () => {
    // agent lacks admin.read but has agent.read → the any-of set is satisfied.
    expect(
      await auth.authorize('tok:bob', 'admin.read', 'agent.read'),
    ).toMatchObject({ ok: true })
  })

  it('denies when NONE of the required permissions are held', async () => {
    expect(
      await auth.authorize('tok:carol', 'admin.read', 'agent.read', 'agent.write'),
    ).toMatchObject({ ok: false, status: 403, reason: 'forbidden' })
  })

  it('emits an authz.denied governance event carrying role + required set', async () => {
    const { events, sink } = withSink()
    const a = createServerAuth({ verifier, roles, permissions, sink })
    await a.authorize('tok:carol', 'admin.read', 'admin.write')
    expect(events).toContainEqual({
      type: 'authz.denied',
      userId: 'carol',
      role: 'client',
      required: ['admin.read', 'admin.write'],
    })
  })

  it('a cross-role shared capability is honored only via the granting role', async () => {
    // admin and agent both hold agent.read; client does not.
    expect(await auth.authorize('tok:alice', 'agent.read')).toMatchObject({ ok: true })
    expect(await auth.authorize('tok:bob', 'agent.read')).toMatchObject({ ok: true })
    expect(await auth.authorize('tok:carol', 'agent.read')).toMatchObject({ ok: false, status: 403 })
  })
})
