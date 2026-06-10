import { describe, it, expect } from 'vitest'
import { emit, redact, correlation, validateEvent, defineTelemetry } from '../core'
import type { TelemetryEvent, Sink } from '../types'

function ev(over: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return { id: 'e1', ts: '2026-06-08T00:00:00Z', domain: 'http', type: 'request', severity: 'info', ...over }
}

function capturingSink(): { sink: Sink; events: TelemetryEvent[] } {
  const events: TelemetryEvent[] = []
  return { sink: { emit: (e) => { events.push(e) } }, events }
}

describe('correlation', () => {
  it('prefers x-request-id', () => {
    expect(correlation({ 'x-request-id': 'rid-1', traceparent: '00-' + 'a'.repeat(32) + '-b'.repeat(16) + '-01' })).toBe('rid-1')
  })
  it('falls back to the W3C traceparent trace-id', () => {
    const tid = 'a'.repeat(32)
    expect(correlation({ traceparent: `00-${tid}-${'b'.repeat(16)}-01` })).toBe(tid)
  })
  it('returns undefined when neither present / malformed', () => {
    expect(correlation({})).toBeUndefined()
    expect(correlation({ traceparent: 'garbage' })).toBeUndefined()
  })
  it('reads a Headers object', () => {
    const h = new Headers({ 'x-request-id': 'rid-2' })
    expect(correlation(h)).toBe('rid-2')
  })
})

describe('redact', () => {
  it('masks sensitive keys at any depth (default set)', () => {
    const out = redact(ev({ data: { authorization: 'Bearer x', nested: { password: 'p', ok: 1 } } }))
    expect(out.data!.authorization).toBe('[redacted]')
    expect((out.data!.nested as Record<string, unknown>).password).toBe('[redacted]')
    expect((out.data!.nested as Record<string, unknown>).ok).toBe(1)
  })
  it('drops and masks explicit dot-paths', () => {
    const out = redact(ev({ data: { card: { number: '4111', brand: 'visa' }, email: 'a@b.c' } }), {
      drop: ['card.number'],
      mask: ['email'],
    })
    expect((out.data!.card as Record<string, unknown>).number).toBeUndefined()
    expect((out.data!.card as Record<string, unknown>).brand).toBe('visa')
    expect(out.data!.email).toBe('[redacted]')
  })
  it('does not mutate the input event', () => {
    const input = ev({ data: { token: 'secret' } })
    redact(input)
    expect(input.data!.token).toBe('secret')
  })
  it('honours custom sensitive keys', () => {
    const out = redact(ev({ data: { ssn: '123' } }), { sensitiveKeys: ['ssn'] })
    expect(out.data!.ssn).toBe('[redacted]')
  })
})

describe('validateEvent', () => {
  it('flags missing required fields as hard (missing:) issues', () => {
    const issues = validateEvent({ id: '', ts: '', domain: '', type: '', severity: 'info' })
    expect(issues.filter((i) => i.startsWith('missing:')).length).toBe(4)
  })
  it('flags unknown domain/type against a taxonomy (advisory)', () => {
    const tax = { http: ['request'] }
    expect(validateEvent(ev({ domain: 'ghost' }), tax).some((i) => i.includes("unknown domain 'ghost'"))).toBe(true)
    expect(validateEvent(ev({ type: 'ghost' }), tax).some((i) => i.includes('unknown type'))).toBe(true)
    expect(validateEvent(ev(), tax)).toEqual([])
  })
  it('flags an invalid severity', () => {
    expect(validateEvent(ev({ severity: 'loud' as never })).some((i) => i.includes('invalid severity'))).toBe(true)
  })
})

describe('emit', () => {
  it('validates → redacts → hands a clean event to the sink', async () => {
    const { sink, events } = capturingSink()
    const r = await emit(ev({ data: { password: 'p', x: 1 } }), sink)
    expect(r.emitted).toBe(true)
    expect(events).toHaveLength(1)
    expect(events[0]!.data!.password).toBe('[redacted]')
    expect(events[0]!.data!.x).toBe(1)
  })

  it('does NOT emit a hard-invalid event', async () => {
    const { sink, events } = capturingSink()
    const r = await emit(ev({ id: '' }), sink)
    expect(r.emitted).toBe(false)
    expect(events).toHaveLength(0)
    expect(r.issues.some((i) => i.startsWith('missing:'))).toBe(true)
  })

  it('samples out a non-error event when rand >= rate', async () => {
    const { sink, events } = capturingSink()
    const r = await emit(ev({ severity: 'info' }), sink, { sampleRate: 0.5 }, () => 0.9)
    expect(r.emitted).toBe(false)
    expect(r.sampled).toBe(true)
    expect(events).toHaveLength(0)
  })

  it('NEVER samples out error/fatal', async () => {
    const { sink, events } = capturingSink()
    const r = await emit(ev({ severity: 'error' }), sink, { sampleRate: 0 }, () => 0.99)
    expect(r.emitted).toBe(true)
    expect(events).toHaveLength(1)
  })

  it('defaults are deterministic (rand=0 ⇒ everything within rate passes)', async () => {
    const { sink, events } = capturingSink()
    await emit(ev({ severity: 'info' }), sink, { sampleRate: 0.01 }) // rand default 0 < 0.01
    expect(events).toHaveLength(1)
  })

  it('defineTelemetry returns the config', () => {
    const c = defineTelemetry({ sampleRate: 0.2 })
    expect(c.sampleRate).toBe(0.2)
  })
})
