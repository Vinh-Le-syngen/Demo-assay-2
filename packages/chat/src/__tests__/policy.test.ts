import { describe, it, expect } from 'vitest'
import { defineChat } from '../config'
import type { ContentPolicy } from '../config'
import { createChatSession, addMessage } from '../core'
import type { ChatSession } from '../core'

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

describe('defineChat config validation', () => {
  it('applies defaults when no options given', () => {
    const cfg = defineChat({})
    expect(cfg.maxTurns).toBe(200)
    expect(cfg.turnPolicy).toBe('strict-alternation')
  })

  it('rejects maxTurns < 1', () => {
    expect(() => defineChat({ maxTurns: 0 })).toThrow()
  })

  it('rejects maxTurns > 10000', () => {
    expect(() => defineChat({ maxTurns: 10_001 })).toThrow()
  })

  it('rejects invalid turnPolicy', () => {
    expect(() => defineChat({ turnPolicy: 'yolo' as never })).toThrow()
  })

  it('accepts a custom content policy', () => {
    const policy: ContentPolicy = { filter: () => ({ verdict: 'deny', reason: 'test' }) }
    const cfg = defineChat({ contentPolicy: policy })
    expect(cfg.contentPolicy).toBe(policy)
  })
})

describe('content policy enforcement', () => {
  it('blocks messages when policy returns deny', () => {
    const blockAll: ContentPolicy = {
      filter: () => ({ verdict: 'deny', reason: 'blocked' }),
    }
    const cfg = defineChat({ maxTurns: 10, contentPolicy: blockAll })
    const s = createChatSession(cfg, { sessionId: 's1', userId: 'u1', now: NOW })
    const r = addMessage(s, { role: 'user', content: 'bad stuff', now: NOW })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toBe('blocked')
  })

  it('redacts content when policy returns redact', () => {
    const redactor: ContentPolicy = {
      filter: (msg) => {
        if (msg.content.includes('secret')) {
          return { verdict: 'redact', redacted: '[REDACTED]' }
        }
        return { verdict: 'allow' }
      },
    }
    const cfg = defineChat({ maxTurns: 10, turnPolicy: 'free-form', contentPolicy: redactor })
    let s = createChatSession(cfg, { sessionId: 's1', userId: 'u1', now: NOW })
    s = mustAdd(s, 'user', 'my secret password')
    expect(s.messages[0]!.content).toBe('[REDACTED]')
    expect(s.messages[0]!.policyVerdict).toBe('redact')
  })

  it('passes through when policy returns allow', () => {
    const cfg = defineChat({ maxTurns: 10 }) // default allows all
    let s = createChatSession(cfg, { sessionId: 's1', userId: 'u1', now: NOW })
    s = mustAdd(s, 'user', 'hello world')
    expect(s.messages[0]!.content).toBe('hello world')
    expect(s.messages[0]!.policyVerdict).toBe('allow')
  })

  it('records the policy verdict on each message for audit', () => {
    const selective: ContentPolicy = {
      filter: (msg) =>
        msg.role === 'user' ? { verdict: 'allow' } : { verdict: 'redact', redacted: '...' },
    }
    const cfg = defineChat({ maxTurns: 10, contentPolicy: selective })
    let s = createChatSession(cfg, { sessionId: 's1', userId: 'u1', now: NOW })
    s = mustAdd(s, 'user', 'hi')
    s = mustAdd(s, 'assistant', 'hello')
    expect(s.messages[0]!.policyVerdict).toBe('allow')
    expect(s.messages[1]!.policyVerdict).toBe('redact')
  })
})
