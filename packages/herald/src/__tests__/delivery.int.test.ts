import { describe, it, expect } from 'vitest'
import { planNotification } from '../core'
import type {
  Channel,
  ChannelAdapter,
  DeliveryResult,
  MessagePlan,
  NotificationPolicy,
  RenderedMessage,
} from '../types'

// Intra-system integration: the pure plan (planNotification) wired to injected fake ChannelAdapters,
// exercising the contract the host implements — only the plan's `selected` channels get a send() call.
// No real network/credentials; the adapters are in-memory fakes registered by channel.

const T = new Date('2026-06-05T10:00:00Z') // 14:00 Asia/Dubai — outside any 22:00–07:00 window

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

const policy: NotificationPolicy = {
  channels: ['in_app', 'email', 'whatsapp'],
  preferences: 'respect',
  quietHours: 'defer',
  requiresConsent: { whatsapp: true },
}

describe('planNotification → delivery harness (integration)', () => {
  it('dispatches exactly the selected channels and skips suppressed ones', async () => {
    const inApp = fakeAdapter('in_app')
    const email = fakeAdapter('email')
    const whatsapp = fakeAdapter('whatsapp')
    const adapters = { in_app: inApp.adapter, email: email.adapter, whatsapp: whatsapp.adapter }

    // whatsapp has no consent → suppressed by the engine before delivery.
    const plan = planNotification({
      policy,
      preferences: { channels: { email: true } },
      consent: { channels: { whatsapp: false } },
      now: T,
    })
    expect(plan.selected).toEqual(['in_app', 'email'])

    const results = await dispatch(plan, 'client-1', adapters)

    expect(inApp.sent).toHaveLength(1)
    expect(email.sent).toHaveLength(1)
    expect(whatsapp.sent).toHaveLength(0) // never dispatched — suppressed upstream
    expect(results.in_app.ok).toBe(true)
    expect(results.email.providerId).toBe('email-1')
    // the rendered message carries a per-channel template + the recipient id end to end
    expect(email.sent[0]).toMatchObject({ channel: 'email', recipientId: 'client-1', templateId: 'tpl_email' })
  })
})
