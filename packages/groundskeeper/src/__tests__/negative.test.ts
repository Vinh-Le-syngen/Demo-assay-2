import { describe, it, expect } from 'vitest'
import {
  defineGroundskeeper,
  runHousekeeping,
  evaluateHousekeeping,
} from '../core'
import { agingDetector, expiryDetector } from '../detectors'

// Input-validation / unsupported-input negatives: malformed, empty, and garbage rows.
// Detectors must skip unparseable timestamps and absent rows without throwing, and the
// pipeline must produce a clean (no-alert) decision rather than crashing or false-paging.
const NOW = Date.parse('2026-06-03T00:00:00Z')
const RAN_AT = '2026-06-03T00:00:00Z'

describe('negative: malformed detector inputs', () => {
  it('agingDetector skips null/undefined/garbage timestamps instead of flagging them', async () => {
    const rows = [
      { id: 'm1', updated_at: null }, // null -> skipped
      { id: 'm2', updated_at: undefined }, // undefined -> skipped
      { id: 'm3', updated_at: 'not-a-date' }, // unparseable -> skipped
      { id: 'm4', updated_at: '' }, // empty string -> skipped
    ]
    const det = agingDetector('stale', {
      rows: () => rows as Array<{ id: string; updated_at: string | null | undefined }>,
      nowMs: NOW,
      thresholdDays: 1,
      timestamp: (r) => r.updated_at,
      subject: (r) => r.id,
      detail: () => 'stale',
    })
    const found = await det.run()
    expect(found).toEqual([])
  })

  it('expiryDetector skips missing and unparseable expiry timestamps', async () => {
    const det = expiryDetector('expiring', {
      rows: () => [
        { id: 'e1', expires_at: null }, // skipped
        { id: 'e2', expires_at: undefined }, // skipped
        { id: 'e3', expires_at: 'garbage' }, // unparseable -> skipped
      ] as Array<{ id: string; expires_at: string | null | undefined }>,
      nowMs: NOW,
      expiresAt: (r) => r.expires_at,
      subject: (r) => r.id,
      expiredDetail: () => 'expired',
      expiringDetail: () => 'expiring',
    })
    expect(await det.run()).toEqual([])
  })

  it('pipeline over empty + all-malformed detectors yields a clean no-alert decision', async () => {
    const config = defineGroundskeeper({
      detectors: [
        { name: 'empty', run: () => [] },
        agingDetector('all-garbage', {
          rows: () => [{ id: 'g1', ts: 'xxx' }],
          nowMs: NOW,
          thresholdDays: 1,
          timestamp: (r) => r.ts,
          subject: (r) => r.id,
          detail: () => 'd',
        }),
      ],
    })
    const report = await runHousekeeping(config, RAN_AT)
    expect(report.findings).toEqual([])
    expect(report.counts).toEqual({})
    expect(report.highCount).toBe(0)

    const decision = evaluateHousekeeping(report)
    expect(decision).toMatchObject({ alert: false, level: 'info', highCount: 0 })
    expect(decision.highDetectors).toEqual([])
    expect(decision.summary).toBe('no findings')
  })
})
