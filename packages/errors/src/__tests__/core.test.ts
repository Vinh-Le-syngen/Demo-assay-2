import { describe, it, expect } from 'vitest'
import {
  defineRegistry,
  lookup,
  isRetryable,
  domainOf,
  classify,
  validateRegistry,
  alertPlan,
  toTelemetryEvent,
} from '../core'
import type { ErrorRegistry, AlertPolicy } from '../types'

// A product-style registry (DOMAIN = owning component) with a declared vocabulary.
const REG: ErrorRegistry = defineRegistry({
  schemaVersion: 2,
  domains: ['RT', 'INT', 'AUTH', 'DOC'],
  codes: [
    { code: 'RT.DB.TIMEOUT', domain: 'RT', retryable: true, remediation: 'retry with backoff' },
    { code: 'INT.STRIPE.DECLINED', domain: 'INT', retryable: false, severity: 'warn' },
    { code: 'AUTH.TOKEN.INVALID_SIGNATURE', domain: 'AUTH', retryable: false, owner: 'COMP-AUTH' },
    { code: 'DOC.EXTRACT.FAILED', domain: 'DOC', retryable: false, deprecated: true, replacedBy: 'DOC.EXTRACT.UNREADABLE' },
    { code: 'DOC.EXTRACT.UNREADABLE', domain: 'DOC', retryable: false },
  ],
})

describe('lookup / isRetryable / domainOf', () => {
  it('finds a spec by code', () => {
    expect(lookup(REG, 'RT.DB.TIMEOUT')?.domain).toBe('RT')
    expect(lookup(REG, 'NOPE')).toBeUndefined()
  })
  it('reads authoritative retryable, failing closed on unknown', () => {
    expect(isRetryable(REG, 'RT.DB.TIMEOUT')).toBe(true)
    expect(isRetryable(REG, 'INT.STRIPE.DECLINED')).toBe(false)
    expect(isRetryable(REG, 'GHOST')).toBe(false)
  })
  it('extracts the domain prefix and rejects malformed codes', () => {
    expect(domainOf('AUTH.TOKEN.INVALID_SIGNATURE')).toBe('AUTH')
    expect(domainOf('garbage')).toBeUndefined()
    expect(domainOf('lower.case.code')).toBeUndefined()
  })
})

describe('classify', () => {
  const matchers = [
    { code: 'RT.DB.TIMEOUT', test: (e: unknown) => (e as { code?: string })?.code === 'ETIMEDOUT' },
    { code: 'INT.STRIPE.DECLINED', test: (e: unknown) => String(e).includes('declined') },
  ]
  it('returns the first matching code', () => {
    expect(classify({ code: 'ETIMEDOUT' }, matchers, 'RT.UNKNOWN.UNKNOWN')).toBe('RT.DB.TIMEOUT')
    expect(classify('card declined', matchers, 'RT.UNKNOWN.UNKNOWN')).toBe('INT.STRIPE.DECLINED')
  })
  it('falls back when nothing matches and survives a throwing matcher', () => {
    const boom = [{ code: 'X', test: () => { throw new Error('boom') } }, ...matchers]
    expect(classify('nope', boom, 'FALLBACK')).toBe('FALLBACK')
  })
})

describe('validateRegistry', () => {
  it('passes a clean registry', () => {
    expect(validateRegistry(REG)).toEqual([])
  })
  it('enforces the declared vocabulary, shape, domain match, duplicates, and successors', () => {
    const bad: ErrorRegistry = {
      schemaVersion: 2,
      domains: ['RT', 'DOM'],
      codes: [
        { code: 'lowercase.bad', domain: 'RT', retryable: false },
        { code: 'INT.X.Y', domain: 'DOM', retryable: false }, // prefix INT vs declared DOM
        { code: 'WAT.A.B', domain: 'WAT', retryable: false }, // WAT not in vocabulary
        { code: 'RT.A.B', domain: 'RT', retryable: false },
        { code: 'RT.A.B', domain: 'RT', retryable: false }, // duplicate
        { code: 'DOM.OLD.CODE', domain: 'DOM', retryable: false, deprecated: true }, // no replacedBy
        { code: 'DOM.Z.Z', domain: 'DOM', retryable: false, replacedBy: 'DOM.GONE.GONE' }, // dangling
      ],
    }
    const issues = validateRegistry(bad)
    expect(issues.some((i) => i.includes("malformed code 'lowercase.bad'"))).toBe(true)
    expect(issues.some((i) => i.includes('domain mismatch'))).toBe(true)
    expect(issues.some((i) => i.includes("'WAT' on 'WAT.A.B' is not in the declared vocabulary"))).toBe(true)
    expect(issues.some((i) => i.includes("duplicate code 'RT.A.B'"))).toBe(true)
    expect(issues.some((i) => i.includes('has no replacedBy'))).toBe(true)
    expect(issues.some((i) => i.includes('not in the registry'))).toBe(true)
  })
  it('shape-only when no vocabulary is declared', () => {
    const noVocab: ErrorRegistry = {
      schemaVersion: 2,
      codes: [{ code: 'ANYTHING.GOES.HERE', domain: 'ANYTHING', retryable: false }],
    }
    expect(validateRegistry(noVocab)).toEqual([])
  })
})

describe('alertPlan', () => {
  const policy: AlertPolicy = {
    rules: [
      { match: { code: 'INT.STRIPE.DECLINED' }, route: 'none', suppress: true },
      { match: { prefix: 'RT' }, route: 'pager', severity: 'fatal' },
      { match: { domain: 'AUTH' }, route: 'slack-security' },
    ],
    default: { route: 'slack-ops' },
  }
  it('exact match wins and can suppress', () => {
    const d = alertPlan(lookup(REG, 'INT.STRIPE.DECLINED')!, policy)
    expect(d).toEqual({ code: 'INT.STRIPE.DECLINED', route: 'none', severity: 'warn', suppress: true })
  })
  it('prefix match routes and overrides severity', () => {
    const d = alertPlan(lookup(REG, 'RT.DB.TIMEOUT')!, policy)
    expect(d.route).toBe('pager')
    expect(d.severity).toBe('fatal')
  })
  it('domain match inherits spec severity', () => {
    const d = alertPlan(lookup(REG, 'AUTH.TOKEN.INVALID_SIGNATURE')!, policy)
    expect(d.route).toBe('slack-security')
    expect(d.severity).toBe('error')
  })
  it('falls through to the default', () => {
    const d = alertPlan(lookup(REG, 'DOC.EXTRACT.UNREADABLE')!, policy)
    expect(d.route).toBe('slack-ops')
  })
  it('no rules + no default ⇒ route none, suppressed', () => {
    const d = alertPlan(lookup(REG, 'DOC.EXTRACT.UNREADABLE')!, { rules: [] })
    expect(d).toEqual({ code: 'DOC.EXTRACT.UNREADABLE', route: 'none', severity: 'error', suppress: true })
  })
})

describe('toTelemetryEvent', () => {
  it('builds an error-domain event carrying the full contract', () => {
    const e = toTelemetryEvent(REG, 'AUTH.TOKEN.INVALID_SIGNATURE', {
      id: 'ev1',
      ts: '2026-06-08T00:00:00Z',
      traceId: 'tr1',
      actor: { id: 'sys', type: 'service' },
      data: { attempt: 3 },
    })
    expect(e.domain).toBe('error')
    expect(e.type).toBe('AUTH.TOKEN.INVALID_SIGNATURE')
    expect(e.severity).toBe('error')
    expect(e.traceId).toBe('tr1')
    expect(e.data).toMatchObject({ registered: true, retryable: false, domain: 'AUTH', owner: 'COMP-AUTH', attempt: 3 })
  })
  it('emits unknown codes marked registered:false, not retryable, with a parsed domain', () => {
    const e = toTelemetryEvent(REG, 'WUT.NO.CODE', { id: 'ev2', ts: '2026-06-08T00:00:00Z' })
    expect(e.data).toMatchObject({ registered: false, retryable: false, domain: 'WUT' })
    expect(e.severity).toBe('error')
  })
  it('surfaces deprecation in the event data', () => {
    const e = toTelemetryEvent(REG, 'DOC.EXTRACT.FAILED', { id: 'ev3', ts: '2026-06-08T00:00:00Z' })
    expect(e.data).toMatchObject({ deprecated: true, replacedBy: 'DOC.EXTRACT.UNREADABLE' })
  })
})
