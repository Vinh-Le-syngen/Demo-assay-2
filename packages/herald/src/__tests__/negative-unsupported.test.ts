import { describe, it, expect } from 'vitest'
import { planNotification } from '../core'
import type { Channel, ChannelAdapter, MessagePlan, NotificationPolicy, RenderedMessage } from '../types'

// Negative — unsupported channel at dispatch time. The engine never invents capability: a channel the
// policy lists is planned/selected, but if the host has no registered adapter for it the harness must
// reject rather than silently drop. No real network/credentials.

const T = new Date('2026-06-05T10:00:00Z')

describe('negative — unsupported channel at dispatch (unsupported)', () => {
  it('the host harness rejects a selected channel that has no registered adapter', async () => {
    const policy: NotificationPolicy = { channels: ['in_app', 'sms'], preferences: 'respect', quietHours: 'defer' }
    const plan: MessagePlan = planNotification({ policy, now: T })
    expect(plan.selected).toEqual(['in_app', 'sms'])

    // Only in_app is registered — sms is unsupported by this host deployment.
    const adapters: Partial<Record<Channel, ChannelAdapter>> = {
      in_app: {
        channel: 'in_app',
        async send(_message: RenderedMessage) {
          return { ok: true }
        },
      },
    }

    async function dispatch(p: MessagePlan) {
      for (const channel of p.selected) {
        const adapter = adapters[channel]
        if (!adapter) throw new Error(`unsupported channel: ${channel}`)
        await adapter.send({ channel, recipientId: 'c-1', templateId: 't', body: 'b' })
      }
    }

    await expect(dispatch(plan)).rejects.toThrow('unsupported channel: sms')
  })

  it('a deployment that registers no adapters at all rejects the very first selected channel', async () => {
    const policy: NotificationPolicy = { channels: ['in_app', 'email'], preferences: 'respect', quietHours: 'defer' }
    const plan: MessagePlan = planNotification({ policy, now: T })
    expect(plan.selected).toEqual(['in_app', 'email'])

    // Empty adapter registry — even the silent in_app channel is unsupported here.
    const adapters: Partial<Record<Channel, ChannelAdapter>> = {}

    async function dispatch(p: MessagePlan) {
      for (const channel of p.selected) {
        const adapter = adapters[channel]
        if (!adapter) throw new Error(`unsupported channel: ${channel}`)
        await adapter.send({ channel, recipientId: 'c-2', templateId: 't', body: 'b' })
      }
    }

    // Fails fast on the first channel (in_app), not a later one — the harness never half-delivers.
    await expect(dispatch(plan)).rejects.toThrow('unsupported channel: in_app')
  })
})
