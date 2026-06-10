import { describe, it, expect } from 'vitest'
import {
  initialSessionState,
  sessionReducer,
  isAuthenticated,
  isPending,
  type SessionState,
} from '../client/session-machine'

const user = { id: 'u1', email: 'a@b.com' }
const at = (status: SessionState['status'], u: SessionState['user'] = null): SessionState => ({
  status,
  user: u,
})

describe('sessionReducer', () => {
  it('starts initializing and is pending', () => {
    expect(initialSessionState.status).toBe('initializing')
    expect(isPending(initialSessionState)).toBe(true)
  })

  it('bootstraps to authenticated or unauthenticated', () => {
    expect(sessionReducer(initialSessionState, { type: 'bootstrapped', user })).toEqual(
      at('authenticated', user),
    )
    expect(sessionReducer(initialSessionState, { type: 'bootstrapped', user: null })).toEqual(
      at('unauthenticated'),
    )
  })

  it('runs a sign-in flow', () => {
    const s1 = sessionReducer(at('unauthenticated'), { type: 'sign_in_start' })
    expect(s1.status).toBe('authenticating')
    const s2 = sessionReducer(s1, { type: 'sign_in_success', user })
    expect(s2).toEqual(at('authenticated', user))
    expect(isAuthenticated(s2)).toBe(true)
  })

  it('captures sign-in errors', () => {
    const s = sessionReducer(at('authenticating'), { type: 'sign_in_error', error: 'bad creds' })
    expect(s).toEqual({ status: 'errored', user: null, error: 'bad creds' })
  })

  it('ignores sign_in_start when already authenticated', () => {
    const s = at('authenticated', user)
    expect(sessionReducer(s, { type: 'sign_in_start' })).toBe(s)
  })

  it('refreshes only from authenticated, keeping the user', () => {
    const authed = at('authenticated', user)
    const refreshing = sessionReducer(authed, { type: 'refresh_start' })
    expect(refreshing).toEqual({ status: 'refreshing', user })
    expect(isAuthenticated(refreshing)).toBe(true)
    expect(sessionReducer(refreshing, { type: 'refresh_success', user })).toEqual(authed)
    // refresh_start is a no-op when not authenticated
    expect(sessionReducer(at('unauthenticated'), { type: 'refresh_start' }).status).toBe(
      'unauthenticated',
    )
  })

  it('refresh failure expires the session', () => {
    expect(sessionReducer(at('refreshing', user), { type: 'refresh_error' })).toEqual(
      at('expired'),
    )
  })

  it('expire applies only to an active session (distinct from sign-out)', () => {
    expect(sessionReducer(at('authenticated', user), { type: 'expire' })).toEqual(at('expired'))
    expect(sessionReducer(at('unauthenticated'), { type: 'expire' }).status).toBe('unauthenticated')
  })

  it('runs a sign-out flow ending unauthenticated (not expired)', () => {
    const out = sessionReducer(at('authenticated', user), { type: 'sign_out_start' })
    expect(out.status).toBe('signing-out')
    expect(sessionReducer(out, { type: 'sign_out_done' })).toEqual(at('unauthenticated'))
  })

  it('reset returns to unauthenticated', () => {
    expect(sessionReducer(at('errored', null), { type: 'reset' })).toEqual(at('unauthenticated'))
  })
})
