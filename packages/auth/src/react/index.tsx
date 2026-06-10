// @sys/auth/react — thin React binding over the pure session machine. Owns NO session
// logic of its own beyond wiring: it drives the machine, resolves role, runs the idle
// policy (Recovery), and emits events (Observability). It does NOT provision data —
// that is server-authoritative (DB trigger / bootstrap endpoint).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AuthUser, Permission, ResolvedRole } from '../core/contract'
import type { AuthMethodDescriptor } from '../core/config'
import type { AuthEventSink } from '../observability/index'
import { noopSink } from '../observability/index'
import type { ClientBackend, OAuthProvider } from '../client/backend'
import { buildSignInMethods, type SignInMethodView } from '../client/sign-in'

// Re-export the client backend contract so consumers can implement a typed backend (incl.
// individual capabilities like `passkey`) against @sys/auth/react without deep imports.
export type { ClientBackend, OAuthProvider } from '../client/backend'
import {
  initialSessionState,
  isPending,
  sessionReducer,
  type SessionState,
} from '../client/session-machine'

export type ClientAuthDeps = {
  backend: ClientBackend
  /** Enabled method descriptors (from defineAuth). Drives `useSignIn().methods`. */
  methods?: AuthMethodDescriptor[]
  /** Resolve a role for a user (Governance seam). Optional. */
  resolveRole?: (user: AuthUser) => Promise<ResolvedRole | null>
  /** Observability sink. Defaults to no-op. */
  sink?: AuthEventSink
  /** Idle timeout (ms). When set, an inactive authenticated session expires. */
  idleTimeoutMs?: number
}

/** Headless sign-in: the available methods to render + bound handlers + status. The app
 * supplies the markup. */
export type UseSignIn = {
  methods: SignInMethodView[]
  status: 'idle' | 'pending' | 'error'
  error: string | null
  signInWithOAuth(provider: OAuthProvider): Promise<void>
  signInWithPasskey(): Promise<void>
  signInWithNationalId(provider: string): Promise<void>
  sendMagicLink(email: string): Promise<void>
  requestOtp(destination: string): Promise<void>
}

export type AuthContextValue = {
  status: SessionState['status']
  user: AuthUser | null
  role: ResolvedRole | null
  loading: boolean
  authenticated: boolean
  /** UX affordance ONLY — never the authorization boundary (that is server-side). */
  can: (perm: Permission) => boolean
  signInWithPassword: (email: string, password: string) => Promise<void>
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>
  sendMagicLink: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const

export function createClientAuth(deps: ClientAuthDeps) {
  const sink = deps.sink ?? noopSink
  const Ctx = createContext<AuthContextValue | null>(null)

  function AuthProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(sessionReducer, initialSessionState)
    const [role, setRole] = useState<ResolvedRole | null>(null)
    const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Bootstrap + subscribe to session changes (provider SDK; no hand-rolled parsing).
    useEffect(() => {
      let active = true
      deps.backend.getSession().then((user) => {
        if (active) dispatch({ type: 'bootstrapped', user })
      })
      const unsub = deps.backend.onAuthStateChange((user) => {
        if (user) dispatch({ type: 'sign_in_success', user })
        else dispatch({ type: 'sign_out_done' })
      })
      return () => {
        active = false
        unsub()
      }
    }, [])

    // Resolve role + emit on the user changing.
    const userId = state.user?.id ?? null
    useEffect(() => {
      if (!state.user) {
        setRole(null)
        return
      }
      sink.emit({ type: 'authn.success', userId: state.user.id })
      let active = true
      if (deps.resolveRole) {
        deps.resolveRole(state.user).then((r) => {
          if (active) setRole(r)
        })
      }
      return () => {
        active = false
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId])

    // Idle policy (Recovery): expire an inactive authenticated session.
    useEffect(() => {
      if (!deps.idleTimeoutMs || state.status !== 'authenticated') return
      if (typeof document === 'undefined') return
      const reset = () => {
        if (idleTimer.current) clearTimeout(idleTimer.current)
        idleTimer.current = setTimeout(() => {
          sink.emit({ type: 'token.expired' })
          dispatch({ type: 'expire' })
          void deps.backend.signOut()
        }, deps.idleTimeoutMs)
      }
      reset()
      for (const ev of ACTIVITY_EVENTS) document.addEventListener(ev, reset, { passive: true })
      return () => {
        if (idleTimer.current) clearTimeout(idleTimer.current)
        for (const ev of ACTIVITY_EVENTS) document.removeEventListener(ev, reset)
      }
    }, [state.status])

    const can = useCallback(
      (perm: Permission) => role?.permissions.includes(perm) ?? false,
      [role],
    )

    const signInWithPassword = useCallback(async (email: string, password: string) => {
      if (!deps.backend.signInWithPassword) throw new Error('password method not enabled')
      dispatch({ type: 'sign_in_start' })
      try {
        const user = await deps.backend.signInWithPassword(email, password)
        dispatch({ type: 'sign_in_success', user })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'sign-in failed'
        sink.emit({ type: 'authn.failure', reason: message })
        dispatch({ type: 'sign_in_error', error: message })
        throw err
      }
    }, [])

    const signInWithOAuth = useCallback(async (provider: OAuthProvider) => {
      if (!deps.backend.startOAuth) throw new Error('oauth method not enabled')
      dispatch({ type: 'sign_in_start' })
      await deps.backend.startOAuth(provider) // redirects; session arrives via onAuthStateChange
    }, [])

    const sendMagicLink = useCallback(async (email: string) => {
      if (!deps.backend.sendMagicLink) throw new Error('magicLink method not enabled')
      await deps.backend.sendMagicLink(email)
    }, [])

    const signOut = useCallback(async () => {
      dispatch({ type: 'sign_out_start' })
      try {
        await deps.backend.signOut()
      } finally {
        dispatch({ type: 'sign_out_done' })
      }
    }, [])

    const value = useMemo<AuthContextValue>(
      () => ({
        status: state.status,
        user: state.user,
        role,
        loading: isPending(state),
        authenticated: state.status === 'authenticated' || state.status === 'refreshing',
        can,
        signInWithPassword,
        signInWithOAuth,
        sendMagicLink,
        signOut,
      }),
      [state, role, can, signInWithPassword, signInWithOAuth, sendMagicLink, signOut],
    )

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>
  }

  function useAuth(): AuthContextValue {
    const ctx = useContext(Ctx)
    if (!ctx) throw new Error('useAuth must be used within its AuthProvider')
    return ctx
  }

  // Headless sign-in: derive the renderable method list from config + backend, and expose
  // bound handlers. The app renders the buttons in its own design system.
  function useSignIn(): UseSignIn {
    const [status, setStatus] = useState<'idle' | 'pending' | 'error'>('idle')
    const [error, setError] = useState<string | null>(null)
    const methods = useMemo(() => buildSignInMethods(deps.methods ?? [], deps.backend), [])

    const run = useCallback(async (fn: () => Promise<unknown>) => {
      setStatus('pending')
      setError(null)
      try {
        await fn()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'sign-in failed')
        setStatus('error')
        throw e
      }
    }, [])

    return {
      methods,
      status,
      error,
      signInWithOAuth: (provider) => run(() => deps.backend.startOAuth!(provider)),
      signInWithPasskey: () => run(() => deps.backend.passkey!.authenticate()),
      signInWithNationalId: (provider) => run(() => deps.backend.nationalId!.start(provider)),
      sendMagicLink: (email) => run(() => deps.backend.sendMagicLink!(email)),
      requestOtp: (destination) => run(() => deps.backend.requestOtp!(destination)),
    }
  }

  return { AuthProvider, useAuth, useSignIn }
}
