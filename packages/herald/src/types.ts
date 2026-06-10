// @sys/herald — types. The reusable vocabulary of the notification decision layer. Generic and
// host-agnostic: event TYPE strings, party strings, purpose/legal-basis strings are the HOST's
// vocabulary (Qarar supplies them), exactly as the workflow engine is generic over WorkflowDefinition.
// No Supabase, no provider creds, no concrete service/party/country values live here.

/** Delivery channels the engine can reason about. The host implements the adapters. */
export type Channel = 'in_app' | 'email' | 'whatsapp' | 'sms'

/** Compound classification — the axes the policy is keyed on + the engine reasons over. Values are
 *  host vocabulary (e.g. purpose 'case_progress' | 'legal_deadline'); only `urgency` + `overrideLevel`
 *  drive engine logic, the rest are for policy lookup + audit. */
export interface Classification {
  purpose: string
  legalBasis: string
  recipientParty: string
  urgency: 'normal' | 'high' | 'critical'
  /** May this communication override channel preferences / quiet hours? (Consent is NEVER overridden.) */
  overrideLevel: 'none' | 'preference' | 'quiet_hours'
  caseContext?: string
}

/**
 * The canonical envelope every host system emits. THIS IS THE CONTRACT other systems emit against —
 * additive-only once live. Opaque `data` is the host payload; @sys/herald never inspects it (and it
 * must never carry source documents — only references — under the host's data-minimisation rule).
 */
export interface NotificationEvent {
  /** Emitting system, e.g. 'workflow', 'billing', 'groundskeeper'. */
  source: string
  /** Host event type, e.g. 'case.stage.changed'. */
  type: string
  /** ISO-3166 alpha-2; the engine is country-agnostic but the host scopes/persists by it. */
  country: string
  /** The domain entity this concerns (service request / case id, etc.). */
  entityId: string
  /** Monotonic per-entity version, so re-emits of the same state dedupe. */
  version: number
  /** Hash of the host payload, for change detection + audit (not the payload itself). */
  payloadHash: string
  /** ISO timestamp the event occurred (host-supplied — the engine takes `now` explicitly elsewhere). */
  occurredAt: string
  actor?: string
  data?: Record<string, unknown>
}

/** The normalised communication need derived from an event: what to say + how it's classified. */
export interface NotificationIntent {
  /** e.g. 'case.stage.changed', 'renewal.deadline.escalation'. */
  key: string
  event: NotificationEvent
  classification: Classification
}

/** Whether preferences/quiet-hours apply or are overridden for this intent's policy. */
export type PreferenceMode = 'respect' | 'override_if_required'
export type QuietHoursMode = 'defer' | 'bypass_for_deadline'

/** Declarative routing rule (host supplies, keyed by country + event + party + classification). */
export interface NotificationPolicy {
  channels: Channel[]
  preferences: PreferenceMode
  quietHours: QuietHoursMode
  /** Channels that may only be used with explicit consent (e.g. whatsapp, sms). */
  requiresConsent?: Partial<Record<Channel, boolean>>
}

/** Per-recipient channel preferences + quiet-hours window (host-stored; passed in for evaluation). */
export interface RecipientPreferences {
  /** channel → enabled. Absent channel = enabled by default. */
  channels?: Partial<Record<Channel, boolean>>
  /** Local quiet-hours window; null/absent = none. Times are "HH:MM" in `timezone`. */
  quietHours?: { start: string; end: string; timezone: string } | null
}

/** Per-recipient lawful basis to use a channel (host-stored). Absent = not consented. */
export interface RecipientConsent {
  channels?: Partial<Record<Channel, boolean>>
}

/** Why a policy channel was NOT selected. Suppression is a first-class, audited outcome. */
export type SuppressionReason =
  | 'preference_off'
  | 'quiet_hours'
  | 'no_consent'
  | 'no_capability'

/** The engine's decision for one channel — selected, or suppressed with a reason. */
export interface ChannelDecision {
  channel: Channel
  selected: boolean
  reason?: SuppressionReason
  /** When quiet-hours defers (rather than drops) a channel. */
  deferredUntil?: string
}

/** The immutable computed route plan — every policy channel, selected or suppressed + why. */
export interface MessagePlan {
  decisions: ChannelDecision[]
  /** Convenience: channels that will actually send now. */
  selected: Channel[]
  /** Convenience: channels deferred to after quiet hours. */
  deferred: Channel[]
}

// ── Channel adapter + ledger interfaces (the host implements; the engine never does I/O) ──────────

export interface RenderedMessage {
  channel: Channel
  recipientId: string
  templateId: string
  /** Rendered, minimised content — references not source documents. */
  body: string
  subject?: string
  locale?: string
  metadata?: Record<string, unknown>
}

export interface DeliveryResult {
  ok: boolean
  providerId?: string
  error?: string
}

/** A channel adapter the host registers (email, WhatsApp Cloud API, in-app, …). */
export interface ChannelAdapter {
  readonly channel: Channel
  send(message: RenderedMessage): Promise<DeliveryResult>
}
