import { describe, it, expect } from 'vitest'
import { defineChat } from '../config'
import {
  createChatSession,
  addMessage,
  closeSession,
  sessionSummary,
} from '../core'
import type { ChatSession } from '../core'

const cfg = defineChat({ maxTurns: 5, turnPolicy: 'strict-alternation' })
const NOW = '2026-06-09T12:00:00.000Z'

/** Helper: add a message and assert success. */
function mustAdd(
  session: ChatSession,
  role: 'user' | 'assistant' | 'system',
  content: string,
): ChatSession {
  const r = addMessage(session, { role, content, now: NOW })
  if (!r.ok) throw new Error(`expected ok, got: ${r.reason}`)
  return r.session
}

describe('createChatSession', () => {
  it('creates an open session with no messages', () => {
    const s = createChatSession(cfg, { sessionId: 's1', userId: 'u1', now: NOW })
    expect(s.status).toBe('open')
    expect(s.messages).toHaveLength(0)
    expect(s.sessionId).toBe('s1')
    expect(s.userId).toBe('u1')
    expect(s.createdAt).toBe(NOW)
  })
})

describe('addMessage', () => {
  it('adds a user message to an empty session', () => {
    const s = createChatSession(cfg, { sessionId: 's1', userId: 'u1', now: NOW })
    const r = addMessage(s, { role: 'user', content: 'Hello', now: NOW })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.session.messages).toHaveLength(1)
    expect(r.session.messages[0]!.role).toBe('user')
    expect(r.session.messages[0]!.content).toBe('Hello')
    expect(r.session.messages[0]!.policyVerdict).toBe('allow')
  })

  it('preserves immutability — original session unchanged', () => {
    const s = createChatSession(cfg, { sessionId: 's1', userId: 'u1', now: NOW })
    addMessage(s, { role: 'user', content: 'Hello', now: NOW })
    expect(s.messages).toHaveLength(0)
  })

  it('alternates user and assistant in strict-alternation mode', () => {
    let s = createChatSession(cfg, { sessionId: 's1', userId: 'u1', now: NOW })
    s = mustAdd(s, 'user', 'Hi')
    s = mustAdd(s, 'assistant', 'Hello!')
    s = mustAdd(s, 'user', 'How are you?')
    expect(s.messages).toHaveLength(3)
  })

  it('rejects consecutive same-role in strict-alternation mode', () => {
    let s = createChatSession(cfg, { sessionId: 's1', userId: 'u1', now: NOW })
    s = mustAdd(s, 'user', 'Hi')
    const r = addMessage(s, { role: 'user', content: 'Hello again', now: NOW })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('turn policy violation')
  })

  it('allows system messages to appear anywhere (exempt from alternation)', () => {
    let s = createChatSession(cfg, { sessionId: 's1', userId: 'u1', now: NOW })
    s = mustAdd(s, 'user', 'Hi')
    s = mustAdd(s, 'system', 'Context injected')
    s = mustAdd(s, 'assistant', 'Hello!')
    expect(s.messages).toHaveLength(3)
  })

  it('auto-closes at maxTurns', () => {
    const small = defineChat({ maxTurns: 2, turnPolicy: 'strict-alternation' })
    let s = createChatSession(small, { sessionId: 's1', userId: 'u1', now: NOW })
    s = mustAdd(s, 'user', 'A')
    s = mustAdd(s, 'assistant', 'B')
    expect(s.status).toBe('max-turns-reached')
  })

  it('rejects messages on a closed session', () => {
    let s = createChatSession(cfg, { sessionId: 's1', userId: 'u1', now: NOW })
    s = closeSession(s, { now: NOW })
    const r = addMessage(s, { role: 'user', content: 'Hi', now: NOW })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toContain('closed')
  })

  it('allows consecutive same-role in free-form mode', () => {
    const free = defineChat({ maxTurns: 10, turnPolicy: 'free-form' })
    let s = createChatSession(free, { sessionId: 's1', userId: 'u1', now: NOW })
    s = mustAdd(s, 'user', 'A')
    s = mustAdd(s, 'user', 'B')
    s = mustAdd(s, 'user', 'C')
    expect(s.messages).toHaveLength(3)
  })
})

describe('closeSession', () => {
  it('marks an open session as closed', () => {
    const s = createChatSession(cfg, { sessionId: 's1', userId: 'u1', now: NOW })
    const closed = closeSession(s, { now: NOW })
    expect(closed.status).toBe('closed')
    expect(closed.closedAt).toBe(NOW)
  })

  it('is idempotent on already-closed sessions', () => {
    const s = createChatSession(cfg, { sessionId: 's1', userId: 'u1', now: NOW })
    const c1 = closeSession(s, { now: NOW })
    const c2 = closeSession(c1, { now: '2099-01-01T00:00:00Z' })
    expect(c2).toBe(c1) // same reference — no-op
  })
})

describe('sessionSummary', () => {
  it('produces correct summary stats', () => {
    let s = createChatSession(cfg, { sessionId: 's1', userId: 'u1', now: NOW })
    s = mustAdd(s, 'user', 'A')
    s = mustAdd(s, 'assistant', 'B')
    s = mustAdd(s, 'user', 'C')
    const sum = sessionSummary(s)
    expect(sum.totalMessages).toBe(3)
    expect(sum.byRole).toEqual({ user: 2, assistant: 1 })
    expect(sum.sessionId).toBe('s1')
    expect(sum.status).toBe('open')
  })

  it('reports empty session correctly', () => {
    const s = createChatSession(cfg, { sessionId: 's1', userId: 'u1', now: NOW })
    const sum = sessionSummary(s)
    expect(sum.totalMessages).toBe(0)
    expect(sum.byRole).toEqual({})
  })
})
