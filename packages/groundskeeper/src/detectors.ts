// @sys/groundskeeper — reusable detector builders. Generalize the two common shapes from
// SYS-GROUNDSKEEPER: "rows older than a threshold" (stale/aging) and "rows expiring soon
// or already expired" (two-tier). Projects supply the rows + field accessors.

import type { Detector, Finding, Severity } from './core'

const DAY_MS = 86_400_000

/** Flags rows whose timestamp is older than `nowMs - thresholdDays`. */
export function agingDetector<T>(
  name: string,
  opts: {
    rows: () => Iterable<T>
    nowMs: number
    thresholdDays: number
    timestamp: (row: T) => string | null | undefined
    filter?: (row: T) => boolean
    severity?: Severity
    subject: (row: T) => string
    detail: (row: T) => string
  },
): Detector {
  return {
    name,
    run() {
      const cutoff = opts.nowMs - opts.thresholdDays * DAY_MS
      const out: Finding[] = []
      for (const row of opts.rows()) {
        if (opts.filter && !opts.filter(row)) continue
        const raw = opts.timestamp(row)
        const ts = raw ? Date.parse(raw) : NaN
        if (!Number.isNaN(ts) && ts < cutoff) {
          out.push({
            detector: name,
            severity: opts.severity ?? 'warning',
            subject: opts.subject(row),
            detail: opts.detail(row),
          })
        }
      }
      return out
    },
  }
}

/** Two-tier expiry: already expired → high; expiring within `withinDays` → warning. */
export function expiryDetector<T>(
  name: string,
  opts: {
    rows: () => Iterable<T>
    nowMs: number
    withinDays?: number
    expiresAt: (row: T) => string | null | undefined
    subject: (row: T) => string
    expiredDetail: (row: T) => string
    expiringDetail: (row: T) => string
  },
): Detector {
  return {
    name,
    run() {
      const horizon = opts.nowMs + (opts.withinDays ?? 30) * DAY_MS
      const out: Finding[] = []
      for (const row of opts.rows()) {
        const raw = opts.expiresAt(row)
        if (!raw) continue
        const exp = Date.parse(raw)
        if (Number.isNaN(exp)) continue
        if (exp <= opts.nowMs) {
          out.push({
            detector: name,
            severity: 'high',
            subject: opts.subject(row),
            detail: opts.expiredDetail(row),
          })
        } else if (exp <= horizon) {
          out.push({
            detector: name,
            severity: 'warning',
            subject: opts.subject(row),
            detail: opts.expiringDetail(row),
          })
        }
      }
      return out
    },
  }
}
