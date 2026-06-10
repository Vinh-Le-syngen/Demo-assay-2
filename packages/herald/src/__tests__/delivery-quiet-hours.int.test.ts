import { describe, it, expect } from 'vitest'
import { planNotification } from '../core'
import type { Channel, ChannelAdapter, DeliveryResult, MessagePlan, RenderedMessage } from '../types'

// Intra-system integration: the pure plan (planNotification) wired to injected fake ChannelAdapters,
// exercising the quiet-hours deferral contract — a deferred channel is NEVER handed to its adapter,
// while a silent channel still goes out. No real network/credentials; the adapters are in-memory fakes.

const night = new Date('2026-06-05T20:00:00Z') // 00:00 Dubai — inside 22:00–07:00

/** A recording fake adapter that captures every message the harness hands it. */
function fakeAdapter(channel: Channel, result: DeliveryResult = { ok: true, providerId: `${channel}-1` }) {
  const sent: RenderedMessage[] = []
  const adapter: ChannelAdapter = {
    channel,
    async send(message) {
      sent.push(message)
      return result
    },
  }
  return { adapter, sent }
}

/** Minimal host harness: apply a plan by rendering + dispatching only the SELECTED channels. */
async function dispatch(
  plan: MessagePlan,
  recipientId: string,
  adapters: Record<string, ChannelAdapter>,
): Promise<Record<Channel, DeliveryResult>> {
  const out = {} as Record<Channel, DeliveryResult>
  for (const channel of plan.selected) {
    const adapter = adapters[channel]
    if (!adapter) throw new Error(`no adapter for ${channel}`)
    const msg: RenderedMessage = {
      channel,
      recipientId,
      templateId: `tpl_${channel}`,
      body: 'reference-only body',
    }
    out[channel] = await adapter.send(msg)
  }
  return out
}

describe('planNotification → delivery harness (integration, quiet hours)', () => {
  it('defers (does not deliver) email during quiet hours while still sending silent in_app', async () => {
    const inApp = fakeAdapter('in_app')
    const email = fakeAdapter('email')
    const adapters = { in_app: inApp.adapter, email: email.adapter }

    const plan = planNotification({
      policy: { channels: ['in_app', 'email'], preferences: 'respect', quietHours: 'defer' },
      preferences: { quietHours: { start: '22:00', end: '07:00', timezone: 'Asia/Dubai' } },
      now: night,
    })
    expect(plan.deferred).toEqual(['email'])

    const results = await dispatch(plan, 'client-2', adapters)

    expect(inApp.sent).toHaveLength(1) // silent channel still goes out
    expect(email.sent).toHaveLength(0) // deferred → harness never calls the email adapter
    expect(Object.keys(results)).toEqual(['in_app'])
  })

  it('bypasses quiet hours for a deadline so the deferred channel is actually delivered', async () => {
    const inApp = fakeAdapter('in_app')
    const email = fakeAdapter('email')
    const adapters = { in_app: inApp.adapter, email: email.adapter }

    // Same nighttime clock, but the policy bypasses quiet hours for a deadline → email is selected.
    const plan = planNotification({
      policy: { channels: ['in_app', 'email'], preferences: 'respect', quietHours: 'bypass_for_deadline' },
      preferences: { quietHours: { start: '22:00', end: '07:00', timezone: 'Asia/Dubai' } },
      now: night,
    })
    expect(plan.deferred).toEqual([])
    expect(plan.selected).toEqual(['in_app', 'email'])

    const results = await dispatch(plan, 'client-3', adapters)

    expect(email.sent).toHaveLength(1) // bypass → adapter is invoked even during the window
    expect(results.email.providerId).toBe('email-1')
  })
})
