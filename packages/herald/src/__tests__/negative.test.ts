import { describe, it, expect } from 'vitest'
import { planNotification, inQuietHours } from '../core'
import type { NotificationPolicy } from '../types'

// Negative paths: malformed / missing inputs and an unsupported channel at dispatch time.
// The engine is fail-safe — it never throws on absent prefs/consent and never invents capability —
// and the host harness must reject a plan channel it has no adapter for.

const T = new Date('2026-06-05T10:00:00Z')

const consentPolicy: NotificationPolicy = {
  channels: ['whatsapp', 'sms'],
  preferences: 'respect',
  quietHours: 'defer',
  requiresConsent: { whatsapp: true, sms: true },
}

describe('negative — missing recipient state (input-validation)', () => {
  it('suppresses consent-required channels when consent is entirely absent (no throw)', () => {
    // No preferences, no consent objects at all — the engine must default to "not consented", not crash.
    const plan = planNotification({ policy: consentPolicy, now: T })
    expect(plan.selected).toEqual([])
    expect(plan.decisions.map((d) => d.reason)).toEqual(['no_consent', 'no_consent'])
  })

  it('an unknown/garbage timezone fails open (never quiet) rather than throwing', () => {
    expect(() =>
      inQuietHours(T, { start: '22:00', end: '07:00', timezone: 'Totally/Bogus' }),
    ).not.toThrow()
    expect(inQuietHours(T, { start: '22:00', end: '07:00', timezone: 'Totally/Bogus' })).toBe(false)
    // a quiet window present but channel silent & policy respects — still no crash on empty prefs.channels
    const plan = planNotification({
      policy: { channels: ['in_app'], preferences: 'respect', quietHours: 'defer' },
      preferences: { quietHours: { start: '22:00', end: '07:00', timezone: 'Totally/Bogus' } },
      now: T,
    })
    expect(plan.selected).toEqual(['in_app'])
  })
})
