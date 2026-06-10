import { describe, it, expect } from 'vitest'
import { eventKey, planKey, deliveryKey, inQuietHours } from '../core'

// Pure helper unit coverage: idempotency-key derivations + quiet-hour boundary math.
// No I/O, no clock reads — every assertion is a pure function over literal inputs.

describe('idempotency key derivations (pure)', () => {
  it('eventKey is order-stable and embeds every dedup axis', () => {
    const e = { source: 'billing', type: 'invoice.paid', entityId: 'inv-9', version: 1 }
    const k = eventKey(e)
    expect(k).toBe('billing:invoice.paid:inv-9:1')
    // deterministic: same input → same key
    expect(eventKey({ ...e })).toBe(k)
  })

  it('a version bump produces a distinct event key (re-emit dedup boundary)', () => {
    const base = { source: 'workflow', type: 'case.stage.changed', entityId: 'sr-7', version: 2 }
    expect(eventKey(base)).not.toBe(eventKey({ ...base, version: 3 }))
  })

  it('planKey and deliveryKey nest their parent keys verbatim', () => {
    const ev = eventKey({ source: 'workflow', type: 'case.stage.changed', entityId: 'sr-7', version: 2 })
    const pk = planKey(ev, 'policy-v4', 'client-42')
    expect(pk).toBe(`${ev}:policy-v4:client-42`)
    const dk = deliveryKey(pk, 'whatsapp', 'tpl_deadline', '2026-06-09')
    expect(dk).toBe(`${pk}:whatsapp:tpl_deadline:2026-06-09`)
    // distinct channel → distinct delivery key, same plan
    expect(deliveryKey(pk, 'sms', 'tpl_deadline', '2026-06-09')).not.toBe(dk)
  })
})

describe('inQuietHours — boundary inclusivity (pure)', () => {
  const tz = 'Asia/Dubai' // UTC+4, no DST
  it('is start-inclusive and end-exclusive across an overnight span', () => {
    // 22:00 Dubai = 18:00Z → inside (start inclusive)
    expect(inQuietHours(new Date('2026-06-05T18:00:00Z'), { start: '22:00', end: '07:00', timezone: tz })).toBe(true)
    // 07:00 Dubai = 03:00Z → outside (end exclusive)
    expect(inQuietHours(new Date('2026-06-05T03:00:00Z'), { start: '22:00', end: '07:00', timezone: tz })).toBe(false)
    // 06:59 Dubai = 02:59Z → still inside
    expect(inQuietHours(new Date('2026-06-05T02:59:00Z'), { start: '22:00', end: '07:00', timezone: tz })).toBe(true)
  })
})
