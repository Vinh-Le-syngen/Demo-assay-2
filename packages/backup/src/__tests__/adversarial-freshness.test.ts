// adversarial (protocol-misuse) — freshness must not be fooled by clock abuse into hiding a
// stale or absent backup: a future-dated last-success, a rewound `now`, or an attacker-supplied
// absurd maxAgeHours must never suppress a legitimate staleness/absence alert.
import { describe, it, expect } from 'vitest'
import { evaluateFreshness, backupFreshness } from '../core'

describe('adversarial — freshness under clock abuse', () => {
  const now = new Date('2026-06-03T12:00:00Z')

  it('a future-dated last-success yields a negative age but is still NOT treated as stale-by-time alone', () => {
    // A forged future timestamp produces ageHours < 0; the function must not crash and must
    // report it honestly (negative age, not stale-by-age). The anomaly is observable.
    const future = new Date(now.getTime() + 10 * 60 * 60 * 1000)
    const r = backupFreshness(future, now, 25)
    expect(r.ageHours).toBeLessThan(0)
    expect(r.stale).toBe(false)
    expect(Number.isFinite(r.ageHours)).toBe(true)
  })

  it('a rewound clock cannot mask an absent backup — null is stale regardless of now', () => {
    const rewound = new Date('1999-01-01T00:00:00Z')
    expect(evaluateFreshness(null, rewound, 25)).toMatchObject({ alert: true })
    expect(backupFreshness(null, rewound).ageHours).toBe(Infinity)
  })

  it('an absurd maxAgeHours cannot be abused to suppress a never-backed-up alert', () => {
    // Even with an attacker-supplied gigantic window, a missing backup still alerts.
    const d = evaluateFreshness(null, now, Number.MAX_SAFE_INTEGER)
    expect(d.alert).toBe(true)
    expect(d.reason).toMatch(/no successful backup/i)
  })
})
