// @sys/chat — core (Control). Pure session lifecycle: create, add message, close, summarize.
// Zero side-effects; storage, transport, and actual moderation are the host's concern.
// The package owns session state + turn-ordering decisions; content filtering is delegated
// to the injected ContentPolicy seam.

import type { ChatConfig, ContentVerdict } from './config'

/** Message roles — the closed vocabulary for who is speaking. */
export const MESSAGE_ROLES = ['user', 'assistant', 'system'] as const
export type MessageRole = (typeof MESSAGE_ROLES)[number]

/** A single chat message. Immutable once added to a session. */
export type ChatMessage = {
  readonly role: MessageRole
  readonly content: string
  readonly timestamp: string // ISO 8601
  /** Content-policy verdict that was applied (for audit). */
  readonly policyVerdict: ContentVerdict
  /** Optional metadata the host can attach (opaque to the engine). */
  readonly metadata?: Readonly<Record<string, unknown>>
}

export type SessionStatus = 'open' | 'closed' | 'max-turns-reached'

/** An immutable chat session snapshot. Every mutation returns a new snapshot. */
export type ChatSession = {
  readonly sessionId: string
  readonly userId: string
  readonly config: ChatConfig
  readonly messages: readonly ChatMessage[]
  readonly status: SessionStatus
  readonly createdAt: string
  readonly closedAt?: string
}

export type SessionSummary = {
  sessionId: string
  status: SessionStatus
  totalMessages: number
  byRole: Record<string, number>
  createdAt: string
  closedAt?: string
}

/** Create a new empty session. */
export function createChatSession(
  config: ChatConfig,
  init: { sessionId: string; userId: string; now?: string },
): ChatSession {
  return {
    sessionId: init.sessionId,
    userId: init.userId,
    config,
    messages: [],
    status: 'open',
    createdAt: init.now ?? new Date().toISOString(),
  }
}

export type AddMessageResult =
  | { ok: true; session: ChatSession }
  | { ok: false; reason: string }

/**
 * Add a message to an open session. Returns a new session snapshot or a rejection reason.
 *
 * Enforces:
 * 1. Session must be open.
 * 2. Turn policy (strict-alternation: no consecutive same-role, except 'system').
 * 3. Content policy (the injected seam's filter).
 * 4. Max-turn limit.
 */
export function addMessage(
  session: ChatSession,
  input: { role: MessageRole; content: string; metadata?: Record<string, unknown>; now?: string },
): AddMessageResult {
  if (session.status !== 'open') {
    return { ok: false, reason: `session is ${session.status}` }
  }

  // Turn policy (system messages are exempt — they can appear anywhere).
  if (session.config.turnPolicy === 'strict-alternation' && input.role !== 'system') {
    const last = lastNonSystemMessage(session.messages)
    if (last && last.role === input.role) {
      return { ok: false, reason: `turn policy violation: consecutive '${input.role}' messages` }
    }
  }

  // Content policy (injected seam).
  const policyResult = session.config.contentPolicy.filter({
    role: input.role,
    content: input.content,
  })

  if (policyResult.verdict === 'deny') {
    return { ok: false, reason: policyResult.reason ?? 'content denied by policy' }
  }

  const message: ChatMessage = {
    role: input.role,
    content: policyResult.verdict === 'redact' ? (policyResult.redacted ?? '') : input.content,
    timestamp: input.now ?? new Date().toISOString(),
    policyVerdict: policyResult.verdict,
    metadata: input.metadata,
  }

  const messages = [...session.messages, message]
  const maxReached = messages.length >= session.config.maxTurns

  return {
    ok: true,
    session: {
      ...session,
      messages,
      status: maxReached ? 'max-turns-reached' : 'open',
    },
  }
}

/** Close an open session. Idempotent on already-closed sessions. */
export function closeSession(
  session: ChatSession,
  opts?: { now?: string },
): ChatSession {
  if (session.status === 'closed') return session
  return {
    ...session,
    status: 'closed',
    closedAt: opts?.now ?? new Date().toISOString(),
  }
}

/** Compute a pure summary of a session (no side-effects). */
export function sessionSummary(session: ChatSession): SessionSummary {
  const byRole: Record<string, number> = {}
  for (const m of session.messages) {
    byRole[m.role] = (byRole[m.role] ?? 0) + 1
  }
  return {
    sessionId: session.sessionId,
    status: session.status,
    totalMessages: session.messages.length,
    byRole,
    createdAt: session.createdAt,
    closedAt: session.closedAt,
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────

function lastNonSystemMessage(messages: readonly ChatMessage[]): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]!.role !== 'system') return messages[i]
  }
  return undefined
}
