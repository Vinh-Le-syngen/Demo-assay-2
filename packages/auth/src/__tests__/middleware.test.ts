import { describe, it, expect } from 'vitest'
import { createAuthMiddleware, type RouteClass } from '../middleware/index'
import type { MiddlewareSession } from '../middleware/index'

const req = new Request('http://localhost/')

function mw(klass: RouteClass, session: MiddlewareSession) {
  return createAuthMiddleware({
    classify: () => klass,
    readSession: () => session,
  })
}

const authed: MiddlewareSession = { user: { id: 'u1' } }
const anon: MiddlewareSession = { user: null }

describe('createAuthMiddleware (routing only)', () => {
  it('continues on public routes regardless of session', async () => {
    expect(await mw('public', anon).decide('/', req)).toEqual({ action: 'continue' })
    expect(await mw('public', authed).decide('/', req)).toEqual({ action: 'continue' })
  })

  it('redirects an authed user away from auth pages', async () => {
    expect(await mw('auth', authed).decide('/auth', req)).toEqual({
      action: 'redirect',
      to: '/dashboard',
      reason: 'authed_on_auth_page',
    })
  })

  it('lets an anonymous user reach auth pages', async () => {
    expect(await mw('auth', anon).decide('/auth', req)).toEqual({ action: 'continue' })
  })

  it('redirects an anonymous user away from protected routes with returnUrl', async () => {
    expect(await mw('protected', anon).decide('/dashboard/x', req)).toEqual({
      action: 'redirect',
      to: '/auth?returnUrl=%2Fdashboard%2Fx',
      reason: 'unauthenticated',
    })
  })

  it('lets an authed user into protected routes', async () => {
    expect(await mw('protected', authed).decide('/dashboard', req)).toEqual({ action: 'continue' })
  })

  it('honors custom loginPath / authedHome / returnUrlParam', async () => {
    const m = createAuthMiddleware({
      classify: () => 'protected',
      readSession: () => anon,
      loginPath: '/login',
      returnUrlParam: 'next',
    })
    expect(await m.decide('/x', req)).toEqual({
      action: 'redirect',
      to: '/login?next=%2Fx',
      reason: 'unauthenticated',
    })
  })
})
