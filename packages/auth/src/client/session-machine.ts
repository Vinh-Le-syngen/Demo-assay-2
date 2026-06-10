// @sys/auth client — the session state machine (Recovery + Control). Pure, framework-
// agnostic, fully testable. This is the anti-"god-object" core: the React binding is a
// thin shell over these explicit states/transitions. No transport, no React, no timers.

import type { AuthUser } from '../core/contract'

export type SessionStatus =
  | 'initializing' // bootstrapping: reading any existing session
  | 'unauthenticated'
  | 'authenticating' // a sign-in attempt is in flight
  | 'authenticated'
  | 'refreshing' // token refresh in flight (user still considered present)
  | 'expired' // session lapsed (idle/token) — distinct from a clean sign-out
  | 'signing-out'
  | 'errored'

export type SessionState = {
  status: SessionStatus
  user: AuthUser | null
  error?: string
}

export type SessionEvent =
  | { type: 'bootstrapped'; user: AuthUser | null }
  | { type: 'sign_in_start' }
  | { type: 'sign_in_success'; user: AuthUser }
  | { type: 'sign_in_error'; error: string }
  | { type: 'refresh_start' }
  | { type: 'refresh_success'; user: AuthUser }
  | { type: 'refresh_error' }
  | { type: 'expire' }
  | { type: 'sign_out_start' }
  | { type: 'sign_out_done' }
  | { type: 'error'; error: string }
  | { type: 'reset' }

export const initialSessionState: SessionState = { status: 'initializing', user: null }

/** Pure transition. Unknown/duplicate events are no-ops (return the same state). */
export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case 'bootstrapped':
      return event.user
        ? { status: 'authenticated', user: event.user }
        : { status: 'unauthenticated', user: null }

    case 'sign_in_start':
      // Only from a resting state — ignore if a session is already active.
      if (state.status === 'authenticated' || state.status === 'refreshing') return state
      return { status: 'authenticating', user: null }

    case 'sign_in_success':
      return { status: 'authenticated', user: event.user }

    case 'sign_in_error':
      return { status: 'errored', user: null, error: event.error }

    case 'refresh_start':
      // Refresh only makes sense while authenticated; keep the current user.
      if (state.status !== 'authenticated') return state
      return { status: 'refreshing', user: state.user }

    case 'refresh_success':
      return { status: 'authenticated', user: event.user }

    case 'refresh_error':
      return { status: 'expired', user: null }

    case 'expire':
      // Only an active session can expire.
      if (state.status !== 'authenticated' && state.status !== 'refreshing') return state
      return { status: 'expired', user: null }

    case 'sign_out_start':
      return { status: 'signing-out', user: state.user }

    case 'sign_out_done':
    case 'reset':
      return { status: 'unauthenticated', user: null }

    case 'error':
      return { status: 'errored', user: state.user, error: event.error }

    default:
      return state
  }
}

/** Convenience: is a verified user currently present? */
export function isAuthenticated(state: SessionState): boolean {
  return (state.status === 'authenticated' || state.status === 'refreshing') && state.user !== null
}

/** Convenience: is an async transition in flight (for `loading` UX)? */
export function isPending(state: SessionState): boolean {
  return (
    state.status === 'initializing' ||
    state.status === 'authenticating' ||
    state.status === 'refreshing' ||
    state.status === 'signing-out'
  )
}
