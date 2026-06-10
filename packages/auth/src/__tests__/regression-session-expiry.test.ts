// Regression (correctness, behavioral) — session-expiry boundary in the pure session
// reducer. 'expired' is a distinct terminal state from a clean 'unauthenticated'
// sign-out, and it may ONLY be reached from an active session (authenticated /
// refreshing). These pin that boundary so a future refactor can't silently let a
// resting/anonymous state slide into 'expired', or conflate expiry with sign-out.

import { describe, it, expect } from 'vitest'
import { sessionReducer, type SessionState } from '../client/session-machine'

const user = { id: 'u1', email: 'a@b.com' }
const at = (status: SessionState['status'], u: SessionState['user'] = null): SessionState => ({
  status,
  user: u,
})

describe('regression: session-expiry boundary', () => {
  it('expire transitions ONLY from active states', () => {
    expect(sessionReducer(at('authenticated', user), { type: 'expire' })).toEqual(at('expired'))
    expect(sessionReducer(at('refreshing', user), { type: 'expire' })).toEqual(at('expired'))
  })

  it('expire is a no-op from every non-active state (no spurious expiry)', () => {
    for (const status of [
      'initializing',
      'unauthenticated',
      'authenticating',
      'signing-out',
      'errored',
      'expired',
    ] as const) {
      const before = at(status, status === 'expired' ? null : user)
      expect(sessionReducer(before, { type: 'expire' })).toEqual(before)
    }
  })

  it('a failed refresh expires the session (token lapse), clearing the user', () => {
    expect(sessionReducer(at('refreshing', user), { type: 'refresh_error' })).toEqual(at('expired'))
  })

  it('expiry is distinct from a clean sign-out', () => {
    const signedOut = sessionReducer(
      sessionReducer(at('authenticated', user), { type: 'sign_out_start' }),
      { type: 'sign_out_done' },
    )
    expect(signedOut.status).toBe('unauthenticated')
    // The same starting point reached via expire yields a DIFFERENT terminal status.
    expect(sessionReducer(at('authenticated', user), { type: 'expire' }).status).toBe('expired')
  })

  it('an expired session recovers cleanly via a fresh sign-in', () => {
    const expired = at('expired')
    const authenticating = sessionReducer(expired, { type: 'sign_in_start' })
    expect(authenticating.status).toBe('authenticating')
    expect(sessionReducer(authenticating, { type: 'sign_in_success', user })).toEqual(
      at('authenticated', user),
    )
  })
})
