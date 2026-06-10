import { describe, it, expect } from 'vitest'
import { agingDetector, expiryDetector } from '../detectors'

const NOW = Date.parse('2026-06-03T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()
const daysAhead = (n: number) => new Date(NOW + n * 86_400_000).toISOString()

describe('agingDetector (stale/aging pattern)', () => {
  it('flags rows older than the threshold, after the filter', async () => {
    const rows = [
      { id: 'r1', status: 'in_progress', updated_at: daysAgo(20) }, // stale
      { id: 'r2', status: 'in_progress', updated_at: daysAgo(2) }, // fresh
      { id: 'r3', status: 'done', updated_at: daysAgo(99) }, // filtered out
    ]
    const det = agingDetector('stale-requests', {
      rows: () => rows,
      nowMs: NOW,
      thresholdDays: 14,
      timestamp: (r) => r.updated_at,
      filter: (r) => r.status === 'in_progress',
      subject: (r) => r.id,
      detail: (r) => `stuck since ${r.updated_at}`,
    })
    const found = await det.run()
    expect(found.map((f) => f.subject)).toEqual(['r1'])
    expect(found[0]).toMatchObject({ detector: 'stale-requests', severity: 'warning' })
  })

  it('supports high severity (aging AML pattern)', async () => {
    const det = agingDetector('aging-aml', {
      rows: () => [{ id: 'a1', created_at: daysAgo(5) }],
      nowMs: NOW,
      thresholdDays: 3,
      timestamp: (r) => r.created_at,
      severity: 'high',
      subject: (r) => r.id,
      detail: () => 'pending too long',
    })
    expect((await det.run())[0]).toMatchObject({ severity: 'high', subject: 'a1' })
  })
})

describe('expiryDetector (two-tier)', () => {
  it('flags expired as high and expiring-soon as warning', async () => {
    const det = expiryDetector('expiring-docs', {
      rows: () => [
        { id: 'd1', expires_at: daysAgo(1) }, // expired -> high
        { id: 'd2', expires_at: daysAhead(10) }, // soon -> warning
        { id: 'd3', expires_at: daysAhead(90) }, // far -> none
        { id: 'd4', expires_at: null }, // skipped
      ],
      nowMs: NOW,
      withinDays: 30,
      expiresAt: (r) => r.expires_at,
      subject: (r) => r.id,
      expiredDetail: (r) => `expired ${r.expires_at}`,
      expiringDetail: (r) => `expires ${r.expires_at}`,
    })
    const found = await det.run()
    expect(found.map((f) => [f.subject, f.severity])).toEqual([
      ['d1', 'high'],
      ['d2', 'warning'],
    ])
  })
})
