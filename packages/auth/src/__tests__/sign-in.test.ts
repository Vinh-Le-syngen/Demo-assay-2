import { describe, it, expect } from 'vitest'
import { buildSignInMethods, isMethodAvailable } from '../client/sign-in'
import type { ClientBackend } from '../client/backend'
import { passkeyMethod } from '../methods/method-passkey'
import { oauthMethod } from '../methods/method-oauth'
import { magicLinkMethod } from '../methods/method-magiclink'
import { nationalIdMethod } from '../methods/method-national-id'

// A backend exposing oauth + magicLink + nationalId, but NOT passkey.
const backend: ClientBackend = {
  getSession: async () => null,
  onAuthStateChange: () => () => {},
  signOut: async () => {},
  startOAuth: async () => {},
  sendMagicLink: async () => {},
  nationalId: { start: async () => ({ id: 'u1' }) },
}

describe('buildSignInMethods', () => {
  it('keeps only methods the backend supports, in configured order', () => {
    const descriptors = [
      passkeyMethod({ order: 1 }), // no passkey capability -> dropped
      nationalIdMethod({ provider: 'uae-pass', order: 0 }),
      oauthMethod({ google: true, order: 2 }),
      magicLinkMethod({ order: 3 }),
    ]
    const views = buildSignInMethods(descriptors, backend)
    expect(views.map((v) => v.id)).toEqual(['nationalId', 'oauth', 'magicLink'])
  })

  it('tags what input each method needs', () => {
    const views = buildSignInMethods(
      [nationalIdMethod({ provider: 'singpass' }), magicLinkMethod()],
      backend,
    )
    expect(views.find((v) => v.id === 'nationalId')?.needsInput).toBe('none')
    expect(views.find((v) => v.id === 'magicLink')?.needsInput).toBe('email')
  })

  it('VNeID (Vietnam) flows through as a no-input national-id method', () => {
    const views = buildSignInMethods([nationalIdMethod({ provider: 'vneid' })], backend)
    const view = views.find((v) => v.id === 'nationalId')
    expect(view?.needsInput).toBe('none')
    expect(view?.label).toBe('Continue with VNeID')
  })

  it('passkey is available only when supported', () => {
    expect(isMethodAvailable(passkeyMethod(), backend)).toBe(false)
    const withPasskey: ClientBackend = {
      ...backend,
      passkey: { register: async () => ({ id: 'u' }), authenticate: async () => ({ id: 'u' }), isSupported: () => true },
    }
    expect(isMethodAvailable(passkeyMethod(), withPasskey)).toBe(true)
  })
})
