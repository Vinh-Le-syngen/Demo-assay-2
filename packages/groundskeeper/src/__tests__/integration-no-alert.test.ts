import { describe, it, expect } from 'vitest'
import { defineGroundskeeper, runHousekeeping, evaluateHousekeeping } from '../core'
import { agingDetector, expiryDetector } from '../detectors'

// Intra-system integration (lower-severity path): the same aging + expiry detectors composed
// through runHousekeeping → summarize → evaluateHousekeeping, but with no high-severity rows so
// the pipeline must resolve to a clean no-alert decision. Shared fixed-now fixtures, no mocks.
const NOW = Date.parse('2026-06-03T00:00:00Z')
const RAN_AT = '2026-06-03T00:00:00Z'
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()
const daysAhead = (n: number) => new Date(NOW + n * 86_400_000).toISOString()

const requests = [
  { id: 'req-stale', status: 'in_progress', updated_at: daysAgo(20) }, // aging -> warning
  { id: 'req-fresh', status: 'in_progress', updated_at: daysAgo(1) }, // fresh -> none
  { id: 'req-done', status: 'done', updated_at: daysAgo(99) }, // filtered out
]
const docs = [
  { id: 'doc-soon', expires_at: daysAhead(5) }, // expiring -> warning
  { id: 'doc-far', expires_at: daysAhead(120) }, // far -> none
]

describe('groundskeeper pipeline integration (lower-severity → no alert)', () => {
  it('does not alert when only lower-severity findings flow through the pipeline', async () => {
    const config = defineGroundskeeper({
      detectors: [
        agingDetector('stale-requests', {
          rows: () => requests,
          nowMs: NOW,
          thresholdDays: 14,
          timestamp: (r) => r.updated_at,
          filter: (r) => r.status === 'in_progress',
          subject: (r) => r.id,
          detail: (r) => `stuck since ${r.updated_at}`,
        }),
        expiryDetector('expiring-docs', {
          rows: () => docs,
          nowMs: NOW,
          withinDays: 30,
          expiresAt: (r) => r.expires_at,
          subject: (r) => r.id,
          expiredDetail: (r) => `expired ${r.expires_at}`,
          expiringDetail: (r) => `expires ${r.expires_at}`,
        }),
      ],
    })

    const report = await runHousekeeping(config, RAN_AT)
    expect(report.highCount).toBe(0)
    expect(report.findings).toHaveLength(2) // req-stale (warning) + doc-soon (warning)
    expect(report.findings.map((f) => f.subject).sort()).toEqual(['doc-soon', 'req-stale'])

    const decision = evaluateHousekeeping(report)
    expect(decision).toMatchObject({ alert: false, level: 'info', highCount: 0 })
    expect(decision.summary).toBe('no high-severity findings (2 lower-severity)')
  })
})
