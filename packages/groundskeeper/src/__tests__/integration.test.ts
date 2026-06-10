import { describe, it, expect } from 'vitest'
import {
  defineGroundskeeper,
  runHousekeeping,
  evaluateHousekeeping,
} from '../core'
import { agingDetector, expiryDetector } from '../detectors'

// Intra-system integration: real detector builders (aging + expiry) composed through
// runHousekeeping → summarize → evaluateHousekeeping, on shared fixed-now fixtures.
// No mocks of the system under test; only the project-supplied rows are injected.
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
  { id: 'doc-expired', expires_at: daysAgo(2) }, // expired -> high
  { id: 'doc-soon', expires_at: daysAhead(5) }, // expiring -> warning
  { id: 'doc-far', expires_at: daysAhead(120) }, // far -> none
]

function buildConfig() {
  return defineGroundskeeper({
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
}

describe('groundskeeper pipeline integration (run → summarize → evaluate)', () => {
  it('composes aging + expiry detectors into a report that alerts on the expired doc', async () => {
    const report = await runHousekeeping(buildConfig(), RAN_AT)

    // summarize() aggregated both detectors' findings.
    expect(report.ranAt).toBe(RAN_AT)
    expect(report.counts).toEqual({ 'stale-requests': 1, 'expiring-docs': 2 })
    expect(report.findings.map((f) => f.subject).sort()).toEqual([
      'doc-expired',
      'doc-soon',
      'req-stale',
    ])
    // Only the expired doc is high severity.
    expect(report.highCount).toBe(1)

    const decision = evaluateHousekeeping(report)
    expect(decision).toMatchObject({ alert: true, level: 'error', highCount: 1 })
    expect(decision.highByDetector).toEqual({ 'expiring-docs': 1 })
    expect(decision.highDetectors).toEqual(['expiring-docs'])
    expect(decision.summary).toContain('expiring-docs=1')
  })
})
