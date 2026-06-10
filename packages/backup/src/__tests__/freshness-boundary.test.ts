// unit (pure|boundary) — boundary conditions of the pure freshness primitives:
// the exact maxAgeHours threshold, string-date parsing, and the Infinity age for a
// never-backed-up source. These are the decision edges the alerting layer rides on.
import { describe, it, expect } from 'vitest'
import { backupFreshness, evaluateFreshness } from '../core'

const now = new Date('2026-06-03T12:00:00Z')

describe('backupFreshness — boundary', () => {
  it('is NOT stale exactly at the threshold and IS stale just past it', () => {
    // exactly 25h old → ageHours === maxAgeHours → not stale (uses strict >)
    const atThreshold = new Date(now.getTime() - 25 * 60 * 60 * 1000)
    const r1 = backupFreshness(atThreshold, now, 25)
    expect(r1.ageHours).toBeCloseTo(25, 6)
    expect(r1.stale).toBe(false)

    // one second past 25h → stale
    const pastThreshold = new Date(now.getTime() - (25 * 60 * 60 * 1000 + 1000))
    expect(backupFreshness(pastThreshold, now, 25).stale).toBe(true)
  })

  it('parses an ISO string last-success identically to a Date', () => {
    const iso = '2026-06-03T06:00:00Z'
    const fromString = backupFreshness(iso, now, 25)
    const fromDate = backupFreshness(new Date(iso), now, 25)
    expect(fromString).toEqual(fromDate)
    expect(fromString.ageHours).toBeCloseTo(6, 6)
  })

  it('reports an infinite age (never stale-by-time, always stale-by-policy) for null', () => {
    const r = backupFreshness(null, now, 25)
    expect(r.ageHours).toBe(Infinity)
    expect(r.stale).toBe(true)
  })
})

describe('evaluateFreshness — boundary reason text', () => {
  it('distinguishes never-recorded from time-stale in its reason', () => {
    expect(evaluateFreshness(null, now, 25).reason).toMatch(/no successful backup/i)
    const old = new Date(now.getTime() - 40 * 60 * 60 * 1000)
    const d = evaluateFreshness(old, now, 25)
    expect(d.alert).toBe(true)
    expect(d.reason).toContain('40.0h')
    expect(d.reason).toContain('> 25h')
  })
})
