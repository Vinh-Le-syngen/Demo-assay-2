// @sys/herald — core. The pure NotificationPolicyEngine: given an intent's policy + the recipient's
// preferences/consent + a clock, decide which channels send, which are suppressed (and why), and
// which are deferred. Deterministic, no I/O, `now` injected. The host applies the plan + does delivery.
import type {
  Channel,
  ChannelDecision,
  MessagePlan,
  NotificationPolicy,
  RecipientConsent,
  RecipientPreferences,
} from './types'

export interface PlanInput {
  policy: NotificationPolicy
  preferences?: RecipientPreferences
  consent?: RecipientConsent
  /** Channels' real-time deliverability (e.g. WhatsApp session/template); absent = assume deliverable. */
  capability?: Partial<Record<Channel, boolean>>
  /** Injected clock — the engine never reads Date.now(), so decisions are reproducible. */
  now: Date
}

/** Quiet hours only ever defer NON-silent channels. in_app is silent, so it always passes. */
const SILENT_CHANNELS: ReadonlySet<Channel> = new Set<Channel>(['in_app'])

/** Is `now` inside the [start,end) quiet window? Handles overnight spans (e.g. 22:00→07:00). */
export function inQuietHours(
  now: Date,
  window: { start: string; end: string; timezone: string },
): boolean {
  let hhmm: string
  try {
    hhmm = new Intl.DateTimeFormat('en-GB', {
      timeZone: window.timezone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(now)
  } catch {
    return false // unknown timezone → never suppress (fail open to delivering)
  }
  const { start, end } = window
  if (start === end) return false
  return start < end ? hhmm >= start && hhmm < end : hhmm >= start || hhmm < end
}

/**
 * Decide the message plan for one intent's policy against a recipient. Per channel, in policy order:
 *  1. consent — a consent-required channel without consent is suppressed (NEVER overridden; lawful basis).
 *  2. capability — a channel marked not-deliverable now is suppressed (e.g. no WhatsApp session/template).
 *  3. preference — a channel the user disabled is suppressed UNLESS the policy overrides preferences.
 *  4. quiet hours — a non-silent channel inside the window defers UNLESS the policy bypasses for a deadline.
 *  Otherwise it's selected. Pure: same inputs → same plan.
 */
export function planNotification(input: PlanInput): MessagePlan {
  const { policy, preferences, consent, capability, now } = input
  const decisions: ChannelDecision[] = []

  for (const channel of policy.channels) {
    // 1. Consent — lawful basis. Escalation can move faster, never past consent.
    if (policy.requiresConsent?.[channel] && consent?.channels?.[channel] !== true) {
      decisions.push({ channel, selected: false, reason: 'no_consent' })
      continue
    }
    // 2. Capability — can we physically use it right now?
    if (capability && capability[channel] === false) {
      decisions.push({ channel, selected: false, reason: 'no_capability' })
      continue
    }
    // 3. Preference — user opt-out, unless the policy overrides (escalation).
    const prefOff = preferences?.channels?.[channel] === false
    if (prefOff && policy.preferences === 'respect') {
      decisions.push({ channel, selected: false, reason: 'preference_off' })
      continue
    }
    // 4. Quiet hours — defer non-silent channels, unless the policy bypasses for a deadline.
    const window = preferences?.quietHours
    if (
      window &&
      !SILENT_CHANNELS.has(channel) &&
      policy.quietHours === 'defer' &&
      inQuietHours(now, window)
    ) {
      decisions.push({ channel, selected: false, reason: 'quiet_hours', deferredUntil: window.end })
      continue
    }
    decisions.push({ channel, selected: true })
  }

  return {
    decisions,
    selected: decisions.filter((d) => d.selected).map((d) => d.channel),
    deferred: decisions.filter((d) => !d.selected && d.reason === 'quiet_hours').map((d) => d.channel),
  }
}

/**
 * WhatsApp capability: outside the 24h customer-service session window, business-initiated messages
 * require opt-in + an approved template; inside the window, free-form replies are allowed. Pure.
 */
export function whatsappDeliverable(state: {
  hasOptIn: boolean
  hasOpenSession: boolean
  templateApproved: boolean
}): boolean {
  if (state.hasOpenSession) return true
  return state.hasOptIn && state.templateApproved
}

// ── Idempotency keys (pure, three levels) — dedup at event, plan, and delivery granularity. ───────

export function eventKey(e: { source: string; type: string; entityId: string; version: number }): string {
  return `${e.source}:${e.type}:${e.entityId}:${e.version}`
}

export function planKey(eventId: string, policyVersion: string, recipientId: string): string {
  return `${eventId}:${policyVersion}:${recipientId}`
}

export function deliveryKey(planId: string, channel: Channel, templateId: string, dedupWindow: string): string {
  return `${planId}:${channel}:${templateId}:${dedupWindow}`
}
