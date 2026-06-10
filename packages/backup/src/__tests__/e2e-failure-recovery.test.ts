// e2e (path_kind recovery) — a backup run is opened, fails mid-copy when the sink rejects,
// is recorded as failed with no bytes stored, and a follow-up run against a healthy sink
// completes and persists. Asserts the externally observable run record + sink state across
// the failure → recovery transition, not internals.
import { describe, it, expect } from 'vitest'
import { runBackup, type BackupSource, type BackupSink, type BackupRunStore, type BackupLogger } from '../orchestration'
import { type BackupObject } from '../core'

const obj = (path: string, size: number, version = 'v1'): BackupObject => ({ path, size, version })
const now = () => new Date('2026-06-03T12:00:00Z')

type RunRow = { id: string; status: 'running' | 'completed' | 'failed'; data?: unknown }

/** Full in-memory backup environment: a content-bearing source, a real sink store, run rows. */
function environment(contents: Record<string, Uint8Array>, objects: BackupObject[]) {
  const sink = new Map<string, Uint8Array>()
  const rows: RunRow[] = []
  const logs: Array<{ level: 'info' | 'error'; msg: string }> = []
  let counter = 0

  const source: BackupSource = {
    list: async () => objects,
    download: async (path) => {
      const body = contents[path]
      if (!body) throw new Error(`source missing object: ${path}`)
      return body
    },
  }
  const sinkAdapter: BackupSink = {
    listKeys: async () => new Set(sink.keys()),
    put: async (key, body) => {
      sink.set(key, body)
    },
  }
  const store: BackupRunStore = {
    open: async () => {
      const id = `r${++counter}`
      rows.push({ id, status: 'running' })
      return { id }
    },
    complete: async (id, data) => {
      const row = rows.find((r) => r.id === id)!
      row.status = 'completed'
      row.data = data
    },
    fail: async (id, data) => {
      const row = rows.find((r) => r.id === id)!
      row.status = 'failed'
      row.data = data
    },
  }
  const logger: BackupLogger = {
    info: (_o, msg) => logs.push({ level: 'info', msg }),
    error: (_o, msg) => logs.push({ level: 'error', msg }),
  }
  return { source, sink: sinkAdapter, store, logger, sinkMap: sink, rows, logs }
}

describe('e2e — failure then recovery', () => {
  it('records a failed run when a copy errors, then a clean re-run completes', async () => {
    const objects = [obj('a', 3)]
    const env = environment({ a: new Uint8Array([7, 7, 7]) }, objects)

    // first run: sink.put rejects → run must be recorded failed, no bytes stored
    const failing = { ...env.sink, put: async () => { throw new Error('sink offline') } }
    const r1 = await runBackup({ source: env.source, sink: failing, store: env.store, logger: env.logger, now })
    expect(r1.status).toBe('failed')
    expect(r1.error).toBe('sink offline')
    expect(env.rows[0]!.status).toBe('failed')
    expect(env.sinkMap.size).toBe(0)
    expect(env.logs.some((l) => l.level === 'error')).toBe(true)

    // recovery: sink healthy again → next run completes and persists
    const r2 = await runBackup({ source: env.source, sink: env.sink, store: env.store, logger: env.logger, now })
    expect(r2.status).toBe('completed')
    expect(r2.copied).toEqual(['a#v1'])
    expect(env.sinkMap.get('a#v1')).toEqual(new Uint8Array([7, 7, 7]))
    expect(env.rows.map((r) => r.status)).toEqual(['failed', 'completed'])
  })

  it('a transient mid-batch sink failure leaves no partial run marked completed', async () => {
    const objects = [obj('x', 2), obj('y', 2)]
    const env = environment({ x: new Uint8Array([1, 1]), y: new Uint8Array([2, 2]) }, objects)

    // sink fails on the second key only → whole run must be failed, not partially completed
    let puts = 0
    const flaky: BackupSink = {
      listKeys: env.sink.listKeys,
      put: async (key, body) => {
        if (++puts === 2) throw new Error('sink reset mid-batch')
        await env.sink.put(key, body)
      },
    }
    const r1 = await runBackup({ source: env.source, sink: flaky, store: env.store, logger: env.logger, now })
    expect(r1.status).toBe('failed')
    expect(r1.error).toBe('sink reset mid-batch')
    expect(env.rows[0]!.status).toBe('failed') // never recorded completed

    // recovery: healthy sink finishes the full set
    const r2 = await runBackup({ source: env.source, sink: env.sink, store: env.store, logger: env.logger, now })
    expect(r2.status).toBe('completed')
    expect(env.sinkMap.get('x#v1')).toEqual(new Uint8Array([1, 1]))
    expect(env.sinkMap.get('y#v1')).toEqual(new Uint8Array([2, 2]))
    expect(env.rows.map((r) => r.status)).toEqual(['failed', 'completed'])
  })
})
