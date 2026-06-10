// e2e (path_kind happy) — a full incremental backup run driven end-to-end through every
// injected seam (source → diff → sink.put → store.complete → result + logger). Asserts the
// externally observable run record + sink state, not internals.
import { describe, it, expect } from 'vitest'
import { runBackup, type BackupSource, type BackupSink, type BackupRunStore, type BackupLogger } from '../orchestration'
import { manifestChecksum, type BackupObject } from '../core'

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

describe('e2e — full incremental backup run (happy path)', () => {
  it('copies all objects, persists bytes to the sink, and records a completed run', async () => {
    const objects = [obj('docs/passport.pdf', 4), obj('docs/visa.pdf', 2)]
    const contents = {
      'docs/passport.pdf': new Uint8Array([1, 2, 3, 4]),
      'docs/visa.pdf': new Uint8Array([9, 9]),
    }
    const env = environment(contents, objects)

    const result = await runBackup({
      source: env.source,
      sink: env.sink,
      store: env.store,
      logger: env.logger,
      now,
    })

    // result surface
    expect(result.status).toBe('completed')
    expect(result.objectCount).toBe(2)
    expect(result.totalBytes).toBe(6)
    expect(result.manifestChecksum).toBe(manifestChecksum(objects))
    expect(result.copied.sort()).toEqual(['docs/passport.pdf#v1', 'docs/visa.pdf#v1'])

    // sink actually holds the bytes under versioned keys
    expect(env.sinkMap.get('docs/passport.pdf#v1')).toEqual(contents['docs/passport.pdf'])
    expect(env.sinkMap.get('docs/visa.pdf#v1')).toEqual(contents['docs/visa.pdf'])

    // run record transitioned running → completed
    expect(env.rows).toHaveLength(1)
    expect(env.rows[0]!.status).toBe('completed')
    expect(env.logs.some((l) => l.level === 'info' && /completed/.test(l.msg))).toBe(true)
  })

  it('a second run over an unchanged source copies nothing yet still completes cleanly', async () => {
    const objects = [obj('docs/passport.pdf', 4)]
    const contents = { 'docs/passport.pdf': new Uint8Array([1, 2, 3, 4]) }
    const env = environment(contents, objects)

    const first = await runBackup({ source: env.source, sink: env.sink, store: env.store, logger: env.logger, now })
    expect(first.copied).toEqual(['docs/passport.pdf#v1'])

    const second = await runBackup({ source: env.source, sink: env.sink, store: env.store, logger: env.logger, now })
    expect(second.status).toBe('completed')
    expect(second.copied).toEqual([]) // already present in the sink — idempotent
    expect(second.manifestChecksum).toBe(first.manifestChecksum)
    expect(env.rows.map((r) => r.status)).toEqual(['completed', 'completed'])
  })
})
