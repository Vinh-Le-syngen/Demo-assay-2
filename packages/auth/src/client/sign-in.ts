// @sys/auth client — headless sign-in logic. Given the configured method descriptors + a
// backend, produces the render-ready list of available methods. The app maps these to its
// OWN styled buttons (the package ships logic, not markup). Pure + testable.

import type { AuthMethodDescriptor } from '../core/config'
import type { ClientBackend } from './backend'

export type SignInMethodView = {
  id: AuthMethodDescriptor['id']
  label: string
  order: number
  options?: Record<string, unknown>
  /** What the app must collect before invoking: nothing, an email, or a phone. */
  needsInput: 'none' | 'email' | 'phone'
}

const NEEDS_INPUT: Record<AuthMethodDescriptor['id'], 'none' | 'email' | 'phone'> = {
  passkey: 'none',
  nationalId: 'none',
  oauth: 'none',
  password: 'email',
  magicLink: 'email',
  otp: 'phone',
}

/** Is a configured method actually usable given the backend's capabilities + platform? */
export function isMethodAvailable(d: AuthMethodDescriptor, backend: ClientBackend): boolean {
  switch (d.id) {
    case 'passkey':
      return !!backend.passkey && backend.passkey.isSupported()
    case 'nationalId':
      return !!backend.nationalId
    case 'oauth':
      return !!backend.startOAuth
    case 'magicLink':
      return !!backend.sendMagicLink
    case 'otp':
      return !!backend.requestOtp
    case 'password':
      return !!backend.signInWithPassword
    default:
      return false
  }
}

/** The available methods to render, in configured order (falling back to list order). */
export function buildSignInMethods(
  descriptors: AuthMethodDescriptor[],
  backend: ClientBackend,
): SignInMethodView[] {
  return descriptors
    .filter((d) => isMethodAvailable(d, backend))
    .map((d, i) => ({
      id: d.id,
      label: d.ui.label,
      order: d.ui.order ?? i,
      options: d.options,
      needsInput: NEEDS_INPUT[d.id],
    }))
    .sort((a, b) => a.order - b.order)
}
