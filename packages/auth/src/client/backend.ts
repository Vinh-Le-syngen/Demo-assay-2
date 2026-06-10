// @sys/auth client — the browser Data seam. The host injects an implementation
// (e.g. a Supabase browser client wrapper); the React binding consumes it. Method
// calls are optional — only the ones an app's config enables need to exist.

import type { AuthUser } from '../core/contract'

export type OAuthProvider = 'google' | 'apple'

export interface ClientBackend {
  /** Read the current session (used on mount). */
  getSession(): Promise<AuthUser | null>
  /** Subscribe to session changes; returns an unsubscribe fn. */
  onAuthStateChange(cb: (user: AuthUser | null) => void): () => void
  /** End the session. */
  signOut(): Promise<void>

  // Optional method capabilities (present iff the app enables the method):
  /** WebAuthn passkey: register a new credential, or authenticate with an existing one. */
  passkey?: {
    register(): Promise<AuthUser>
    authenticate(): Promise<AuthUser>
    /** True if the platform supports WebAuthn (gate the UI on this). */
    isSupported(): boolean
  }
  signInWithPassword?(email: string, password: string): Promise<AuthUser>
  signUpWithPassword?(email: string, password: string): Promise<AuthUser>
  sendMagicLink?(email: string): Promise<void>
  startOAuth?(provider: OAuthProvider): Promise<void>
  requestOtp?(destination: string): Promise<void>
  verifyOtp?(destination: string, code: string): Promise<AuthUser>
  /** National digital identity (UAE Pass / Singpass / …). Authenticates AND yields
   * government-verified identity (the adapter forwards verified attributes for KYC). */
  nationalId?: {
    start(provider: string): Promise<AuthUser>
  }
}
