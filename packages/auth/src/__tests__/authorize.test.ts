import { describe, it, expect } from 'vitest'
import { createServerAuth, bearer } from '../server/index'
import type { PermissionModel, RoleResolver, TokenVerifier } from '../core/contract'
import type { AuthEvent, AuthEventSink } from '../observability/index'

const verifier: TokenVerifier = {
  async verify(token) {
    return token === 'good'
      ? { ok: true, claims: { sub: 'u1', email: 'a@b.com' } }
      : { ok: false, reason: 'invalid_signature' }
  },
}

const rolesFor = (role: string | null): RoleResolver => ({
  async resolve() {
    return role ? { role, permissions: [], source: 'db' } : null
  },
})

const ROLE_PERMS: Record<string, string[]> = {
  admin: ['admin.read', 'admin.write'],
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

describe('bearer()', () => {
  it('extracts the token', () => {
    expect(bearer('Bearer abc.def.ghi')).toBe('abc.def.ghi')
  })
  it('returns null for missing/invalid headers', () => {
    expect(bearer(null)).toBeNull()
    expect(bearer('Basic xyz')).toBeNull()
  })
})

describe('createServerAuth.authorize', () => {
  it('401 when no token', async () => {
    const auth = createServerAuth({ verifier, roles: rolesFor('admin'), permissions })
    expect(await auth.authorize(undefined)).toMatchObject({ ok: false, status: 401 })
  })

  it('401 when token is invalid', async () => {
    const auth = createServerAuth({ verifier, roles: rolesFor('admin'), permissions })
    expect(await auth.authorize('bad')).toMatchObject({ ok: false, status: 401 })
  })

  it('403 when authenticated but no role assigned', async () => {
    const auth = createServerAuth({ verifier, roles: rolesFor(null), permissions })
    expect(await auth.authorize('good')).toMatchObject({ ok: false, status: 403, reason: 'no_role' })
  })

  it('403 when role lacks the required permission', async () => {
    const auth = createServerAuth({ verifier, roles: rolesFor('client'), permissions })
    expect(await auth.authorize('good', 'admin.read')).toMatchObject({
      ok: false,
      status: 403,
      reason: 'forbidden',
    })
  })

  it('grants when role has the permission', async () => {
    const { events, sink } = withSink()
    const auth = createServerAuth({ verifier, roles: rolesFor('admin'), permissions, sink })
    const res = await auth.authorize('good', 'admin.read')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.role.role).toBe('admin')
    expect(events).toContainEqual({ type: 'authz.granted', userId: 'u1', role: 'admin' })
  })

  it('authenticates with no permission check when none required', async () => {
    const auth = createServerAuth({ verifier, roles: rolesFor('client'), permissions })
    expect(await auth.authorize('good')).toMatchObject({ ok: true })
  })

  it('emits a failure event on bad auth', async () => {
    const { events, sink } = withSink()
    const auth = createServerAuth({ verifier, roles: rolesFor('admin'), permissions, sink })
    await auth.authorize('bad')
    expect(events).toContainEqual({ type: 'authn.failure', reason: 'invalid_signature' })
  })
})
