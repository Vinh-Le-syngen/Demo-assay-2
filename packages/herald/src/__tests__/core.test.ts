import { describe, it, expect } from 'vitest'
import { planNotification, inQuietHours, whatsappDeliverable, eventKey, planKey, deliveryKey } from '../core'
import type { NotificationPolicy } from '../types'

const T = new Date('2026-06-05T10:00:00Z') // 14:00 Asia/Dubai (outside a 22:00–07:00 quiet window)

const basePolicy: NotificationPolicy = {
  channels: ['in_app', 'email'],
  preferences: 'respect',
  quietHours: 'defer',
}

describe('planNotification — channel selection', () => {
  it('selects every policy channel when nothing suppresses', () => {
    const plan = planNotification({ policy: basePolicy, now: T })
    expect(plan.selected).toEqual(['in_app', 'email'])
    expect(plan.deferred).toEqual([])
  })

  it('suppresses a preference-off channel when the policy respects preferences', () => {
    const plan = planNotification({ policy: basePolicy, preferences: { channels: { email: false } }, now: T })
    expect(plan.selected).toEqual(['in_app'])
    expect(plan.decisions.find((d) => d.channel === 'email')).toMatchObject({ selected: false, reason: 'preference_off' })
  })

  it('OVERRIDES a preference-off channel when the policy escalates (legal deadline)', () => {
    const escalation: NotificationPolicy = { ...basePolicy, channels: ['in_app', 'email', 'whatsapp'], preferences: 'override_if_required', quietHours: 'bypass_for_deadline', requiresConsent: { whatsapp: true } }
    const plan = planNotification({
      policy: escalation,
      preferences: { channels: { email: false } },
      consent: { channels: { whatsapp: true } },
      now: T,
    })
    expect(plan.selected).toContain('email') // preference override
  })

  it('NEVER overrides consent — a consent-required channel without consent is suppressed even on escalation', () => {
    const escalation: NotificationPolicy = { channels: ['whatsapp'], preferences: 'override_if_required', quietHours: 'bypass_for_deadline', requiresConsent: { whatsapp: true } }
    const plan = planNotification({ policy: escalation, consent: { channels: { whatsapp: false } }, now: T })
    expect(plan.selected).toEqual([])
    expect(plan.decisions[0]).toMatchObject({ channel: 'whatsapp', selected: false, reason: 'no_consent' })
  })

  it('suppresses a channel with no capability (e.g. no WhatsApp session/template)', () => {
    const policy: NotificationPolicy = { channels: ['whatsapp'], preferences: 'respect', quietHours: 'defer', requiresConsent: { whatsapp: true } }
    const plan = planNotification({ policy, consent: { channels: { whatsapp: true } }, capability: { whatsapp: false }, now: T })
    expect(plan.decisions[0]).toMatchObject({ selected: false, reason: 'no_capability' })
  })
})

describe('planNotification — quiet hours', () => {
  const quiet = { start: '22:00', end: '07:00', timezone: 'Asia/Dubai' }
  const night = new Date('2026-06-05T20:00:00Z') // 00:00 Dubai → inside 22:00–07:00

  it('defers non-silent channels inside quiet hours (and reports deferredUntil)', () => {
    const plan = planNotification({ policy: basePolicy, preferences: { quietHours: quiet }, now: night })
    expect(plan.selected).toEqual(['in_app']) // in_app is silent → still sent
    expect(plan.deferred).toEqual(['email'])
    expect(plan.decisions.find((d) => d.channel === 'email')).toMatchObject({ reason: 'quiet_hours', deferredUntil: '07:00' })
  })

  it('bypasses quiet hours for a deadline policy', () => {
    const escalation: NotificationPolicy = { ...basePolicy, quietHours: 'bypass_for_deadline' }
    const plan = planNotification({ policy: escalation, preferences: { quietHours: quiet }, now: night })
    expect(plan.selected).toEqual(['in_app', 'email'])
  })

  it('in_app is never deferred by quiet hours', () => {
    const plan = planNotification({ policy: { channels: ['in_app'], preferences: 'respect', quietHours: 'defer' }, preferences: { quietHours: quiet }, now: night })
    expect(plan.selected).toEqual(['in_app'])
  })
})

describe('inQuietHours', () => {
  const tz = 'Asia/Dubai'
  it('handles overnight windows', () => {
    expect(inQuietHours(new Date('2026-06-05T20:00:00Z'), { start: '22:00', end: '07:00', timezone: tz })).toBe(true)  // 00:00 Dubai
    expect(inQuietHours(new Date('2026-06-05T10:00:00Z'), { start: '22:00', end: '07:00', timezone: tz })).toBe(false) // 14:00 Dubai
  })
  it('handles same-day windows', () => {
    expect(inQuietHours(new Date('2026-06-05T09:00:00Z'), { start: '12:00', end: '14:00', timezone: tz })).toBe(true)  // 13:00 Dubai
  })
  it('start===end is never quiet; unknown timezone fails open (not quiet)', () => {
    expect(inQuietHours(new Date(), { start: '09:00', end: '09:00', timezone: tz })).toBe(false)
    expect(inQuietHours(new Date(), { start: '22:00', end: '07:00', timezone: 'Not/AZone' })).toBe(false)
  })
})

describe('whatsappDeliverable — Cloud API session/template rules', () => {
  it('allows free-form inside the 24h session window', () => {
    expect(whatsappDeliverable({ hasOpenSession: true, hasOptIn: false, templateApproved: false })).toBe(true)
  })
  it('outside the window requires opt-in AND an approved template', () => {
    expect(whatsappDeliverable({ hasOpenSession: false, hasOptIn: true, templateApproved: true })).toBe(true)
    expect(whatsappDeliverable({ hasOpenSession: false, hasOptIn: true, templateApproved: false })).toBe(false)
    expect(whatsappDeliverable({ hasOpenSession: false, hasOptIn: false, templateApproved: true })).toBe(false)
  })
})

describe('idempotency keys', () => {
  it('derive deterministically at event / plan / delivery granularity', () => {
    expect(eventKey({ source: 'workflow', type: 'case.stage.changed', entityId: 'sr-1', version: 3 })).toBe('workflow:case.stage.changed:sr-1:3')
    expect(planKey('workflow:case.stage.changed:sr-1:3', 'v2', 'client-1')).toBe('workflow:case.stage.changed:sr-1:3:v2:client-1')
    expect(deliveryKey('plan-1', 'email', 'tpl_stage', '2026-06-05')).toBe('plan-1:email:tpl_stage:2026-06-05')
  })
})
