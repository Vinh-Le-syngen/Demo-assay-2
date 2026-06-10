import { describe, it, expect } from 'vitest'
import { passkeyMethod } from '../methods/method-passkey'
import { nationalIdMethod } from '../methods/method-national-id'
import { passwordMethod } from '../methods/method-password'
import { oauthMethod } from '../methods/method-oauth'
import { magicLinkMethod } from '../methods/method-magiclink'
import { otpMethod } from '../methods/method-otp'
import { defineAuth } from '../core/config'

describe('method plugins (declarative descriptors)', () => {
  it('passkeyMethod', () => {
    expect(passkeyMethod()).toMatchObject({ id: 'passkey', capability: 'passkey' })
    expect(passkeyMethod({ promptEnrollment: true }).options).toEqual({ promptEnrollment: true })
  })

  it('nationalIdMethod (UAE Pass / Singpass) carries provider + default label', () => {
    expect(nationalIdMethod({ provider: 'uae-pass' })).toMatchObject({
      id: 'nationalId',
      capability: 'nationalId',
      ui: { label: 'Continue with UAE Pass' },
      options: { provider: 'uae-pass', verifiedIdentity: true },
    })
    expect(nationalIdMethod({ provider: 'singpass' }).ui.label).toBe('Continue with Singpass')
  })

  it('nationalIdMethod supports every jurisdiction provider with a sensible default label', () => {
    const labels: Record<string, string> = {
      'uae-pass': 'Continue with UAE Pass',
      singpass: 'Continue with Singpass',
      clave: 'Continue with Cl@ve',
      vneid: 'Continue with VNeID',
    }
    for (const [provider, label] of Object.entries(labels)) {
      const m = nationalIdMethod({ provider: provider as never })
      expect(m).toMatchObject({ id: 'nationalId', capability: 'nationalId' })
      expect(m.ui.label).toBe(label)
      expect(m.options).toEqual({ provider, verifiedIdentity: true })
    }
  })

  it('nationalIdMethod (VNeID, Vietnam) is first-class and overridable', () => {
    expect(nationalIdMethod({ provider: 'vneid' }).ui.label).toBe('Continue with VNeID')
    expect(nationalIdMethod({ provider: 'vneid', label: 'Đăng nhập VNeID', order: 0 }).ui).toEqual({
      label: 'Đăng nhập VNeID',
      order: 0,
    })
    expect(nationalIdMethod({ provider: 'vneid', verifiedIdentity: false }).options).toEqual({
      provider: 'vneid',
      verifiedIdentity: false,
    })
  })

  it('passwordMethod', () => {
    expect(passwordMethod()).toMatchObject({ id: 'password', capability: 'password' })
    expect(passwordMethod({ label: 'PW', order: 2 }).ui).toEqual({ label: 'PW', order: 2 })
  })

  it('oauthMethod records selected providers', () => {
    const m = oauthMethod({ google: true, apple: true })
    expect(m.id).toBe('oauth')
    expect(m.options).toEqual({ providers: ['google', 'apple'] })
  })

  it('oauthMethod with no providers yields an empty list', () => {
    expect(oauthMethod().options).toEqual({ providers: [] })
  })

  it('magicLinkMethod', () => {
    expect(magicLinkMethod()).toMatchObject({ id: 'magicLink', capability: 'magicLink' })
  })

  it('otpMethod carries the channel and labels sensibly', () => {
    expect(otpMethod({ channel: 'whatsapp' })).toMatchObject({
      id: 'otp',
      options: { channel: 'whatsapp' },
      ui: { label: 'WhatsApp code' },
    })
    expect(otpMethod({ channel: 'phone' }).ui.label).toBe('SMS code')
  })

  it('descriptors compose into a valid config (subset per app)', () => {
    const cfg = defineAuth({
      backend: 'supabase',
      methods: [passwordMethod(), oauthMethod({ google: true }), magicLinkMethod()],
      primaryMethods: ['oauth', 'magicLink'],
      roles: {},
    })
    expect(cfg.methods.map((m) => m.id)).toEqual(['password', 'oauth', 'magicLink'])
  })
})
