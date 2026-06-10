import { describe, it, expect } from 'vitest'
import { defineReport, getPath, matchFilter, aggregate, toCSV, toJSON, isDue, runReport } from '../core'
import type { ReportDefinition, Row, DataSource } from '../types'

// telemetry-event-shaped rows — reporting aggregates them directly
const ROWS: Row[] = [
  { ts: '2026-06-01T10:00:00Z', domain: 'http', severity: 'info', data: { ms: 100 } },
  { ts: '2026-06-01T11:00:00Z', domain: 'http', severity: 'error', data: { ms: 300 } },
  { ts: '2026-06-02T10:00:00Z', domain: 'error', severity: 'error', data: { ms: 50 } },
  { ts: '2026-06-10T10:00:00Z', domain: 'http', severity: 'info', data: { ms: 200 } },
]

describe('getPath / matchFilter', () => {
  it('reads nested dot-paths', () => {
    expect(getPath(ROWS[0]!, 'data.ms')).toBe(100)
    expect(getPath(ROWS[0]!, 'data.nope')).toBeUndefined()
    expect(getPath(ROWS[0]!, 'a.b.c')).toBeUndefined()
  })
  it('evaluates each operator', () => {
    const r = ROWS[1]!
    expect(matchFilter(r, { field: 'severity', op: 'eq', value: 'error' })).toBe(true)
    expect(matchFilter(r, { field: 'severity', op: 'ne', value: 'info' })).toBe(true)
    expect(matchFilter(r, { field: 'severity', op: 'in', value: ['warn', 'error'] })).toBe(true)
    expect(matchFilter(r, { field: 'data.ms', op: 'gte', value: 300 })).toBe(true)
    expect(matchFilter(r, { field: 'data.ms', op: 'lt', value: 300 })).toBe(false)
    expect(matchFilter(r, { field: 'domain', op: 'contains', value: 'ht' })).toBe(true)
    expect(matchFilter(r, { field: 'data', op: 'exists' })).toBe(true)
    expect(matchFilter(r, { field: 'missing', op: 'exists' })).toBe(false)
  })
})

describe('aggregate', () => {
  it('produces a single total row with no groupBy', () => {
    const def: ReportDefinition = {
      id: 'r1', name: 'totals', source: 's',
      metrics: [
        { name: 'n', op: 'count' },
        { name: 'avg_ms', op: 'avg', field: 'data.ms' },
        { name: 'max_ms', op: 'max', field: 'data.ms' },
        { name: 'errs', op: 'countWhere', where: { field: 'severity', op: 'eq', value: 'error' } },
        { name: 'domains', op: 'distinct', field: 'domain' },
      ],
    }
    const res = aggregate(def, ROWS, '2026-06-11T00:00:00Z')
    expect(res.rowCount).toBe(1)
    expect(res.generatedAt).toBe('2026-06-11T00:00:00Z')
    expect(res.rows[0]!.metrics).toEqual({ n: 4, avg_ms: 162.5, max_ms: 300, errs: 2, domains: 2 })
  })

  it('groups, filters, windows, orders, and limits', () => {
    const def: ReportDefinition = {
      id: 'r2', name: 'by-domain', source: 's',
      window: { field: 'ts', from: '2026-06-01T00:00:00Z', to: '2026-06-05T00:00:00Z' }, // drops Jun 10
      groupBy: ['domain'],
      metrics: [{ name: 'n', op: 'count' }, { name: 'sum_ms', op: 'sum', field: 'data.ms' }],
      orderBy: { metric: 'n', dir: 'desc' },
      limit: 5,
    }
    const res = aggregate(def, ROWS)
    expect(res.rows.map((r) => [r.dimensions.domain, r.metrics.n])).toEqual([
      ['http', 2],
      ['error', 1],
    ])
    expect(res.rows[0]!.metrics.sum_ms).toBe(400) // 100 + 300
  })

  it('zero rows in a bucket yield 0 (no NaN)', () => {
    const def: ReportDefinition = {
      id: 'r3', name: 'empty', source: 's',
      filters: [{ field: 'domain', op: 'eq', value: 'ghost' }],
      metrics: [{ name: 'avg', op: 'avg', field: 'data.ms' }],
    }
    expect(aggregate(def, ROWS).rows[0]!.metrics.avg).toBe(0)
  })
})

describe('export', () => {
  const def: ReportDefinition = {
    id: 'r', name: 'x', source: 's', groupBy: ['domain'],
    metrics: [{ name: 'n', op: 'count' }],
  }
  it('renders CSV with a header and escapes', () => {
    const csv = toCSV(aggregate(def, ROWS))
    const head = csv.split('\n')[0]
    expect(head).toBe('domain,n')
    expect(csv).toContain('http,3')
  })
  it('renders JSON', () => {
    const parsed = JSON.parse(toJSON(aggregate(def, ROWS))) as { reportId: string }
    expect(parsed.reportId).toBe('r')
  })
})

describe('isDue (cron, UTC)', () => {
  const at = (iso: string) => new Date(iso)
  it('matches wildcards', () => {
    expect(isDue('* * * * *', at('2026-06-08T12:34:00Z'))).toBe(true)
  })
  it('matches a specific minute/hour', () => {
    expect(isDue('30 9 * * *', at('2026-06-08T09:30:00Z'))).toBe(true)
    expect(isDue('30 9 * * *', at('2026-06-08T09:31:00Z'))).toBe(false)
  })
  it('matches step and range fields', () => {
    expect(isDue('*/15 * * * *', at('2026-06-08T00:45:00Z'))).toBe(true)
    expect(isDue('*/15 * * * *', at('2026-06-08T00:46:00Z'))).toBe(false)
    expect(isDue('0 9-17 * * *', at('2026-06-08T13:00:00Z'))).toBe(true)
    expect(isDue('0 9-17 * * *', at('2026-06-08T18:00:00Z'))).toBe(false)
  })
  it('matches day-of-week (0=Sunday)', () => {
    // 2026-06-08 is a Monday (dow 1)
    expect(isDue('0 0 * * 1', at('2026-06-08T00:00:00Z'))).toBe(true)
    expect(isDue('0 0 * * 0', at('2026-06-08T00:00:00Z'))).toBe(false)
  })
  it('rejects malformed crons', () => {
    expect(isDue('* * *', at('2026-06-08T00:00:00Z'))).toBe(false)
  })
})

describe('runReport', () => {
  it('pulls via DataSource, aggregates, and delivers when asked', async () => {
    const source: DataSource = { fetch: () => ROWS }
    const delivered: Array<{ id: string; fmt: string; payload: string }> = []
    const def = defineReport({ id: 'rr', name: 'run', source: 'events', metrics: [{ name: 'n', op: 'count' }] })
    const res = await runReport(def, source, {
      now: '2026-06-11T00:00:00Z',
      format: 'csv',
      delivery: { deliver: (id, payload, fmt) => { delivered.push({ id, fmt, payload }) } },
    })
    expect(res.rows[0]!.metrics.n).toBe(4)
    expect(delivered).toHaveLength(1)
    expect(delivered[0]!.fmt).toBe('csv')
    expect(delivered[0]!.payload).toContain('n')
  })
})
