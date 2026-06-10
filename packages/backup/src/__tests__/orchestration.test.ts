import { describe, it, expect } from 'vitest'
import { runBackup, type BackupSource, type BackupSink, type BackupRunStore } from '../orchestration'
import { keyFor, type BackupObject } from '../core'

function fakes(objects: BackupObject[], existing: string[] = []) {
  const put: string[] = []
  const store: { opened: boolean; completed?: unknown; failed?: unknown } = { opened: false }
  const source: BackupSource = {
    list: async () => objects,
    download: async () => new Uint8Array([1, 2, 3]),
  }
  const sink: BackupSink = {
    listKeys: async () => new Set(existing),
    put: async (key) => {
      put.push(key)
    },
  }
  const runStore: BackupRunStore = {
    open: async () => {
      store.opened = true
      return { id: 'b1' }
    },
    complete: async (_id, data) => {
      store.completed = data
    },
    fail: async (_id, data) => {
      store.failed = data
    },
  }
  return { source, sink, runStore, put, store }
}

const obj = (path: string, size: number, version = 'v1'): BackupObject => ({ path, size, version })
const now = () => new Date('2026-06-03T12:00:00Z')

describe('runBackup', () => {
  it('copies only the incremental diff and records completion', async () => {
    const objects = [obj('a', 10), obj('b', 20)]
    const f = fakes(objects, [keyFor(obj('a', 10))]) // 'a' already backed up
    const r = await runBackup({ source: f.source, sink: f.sink, store: f.runStore, now })

    expect(r.status).toBe('completed')
    expect(r.copied).toEqual(['b#v1']) // only the missing one
    expect(r.objectCount).toBe(2) // totals over the FULL set
    expect(r.totalBytes).toBe(30)
    expect(r.manifestChecksum).toMatch(/^[0-9a-f]{64}$/)
    expect(f.store.completed).toMatchObject({ objectCount: 2, copied: 1 })
  })

  it('marks the run failed and returns an error result on failure (never throws)', async () => {
    const f = fakes([obj('a', 10)])
    f.sink.put = async () => {
      throw new Error('R2 unavailable')
    }
    let alerted: Error | null = null
    const r = await runBackup({
      source: f.source,
      sink: f.sink,
      store: f.runStore,
      alert: { capture: (e) => (alerted = e) },
      now,
    })

    expect(r.status).toBe('failed')
    expect(r.error).toBe('R2 unavailable')
    expect(f.store.failed).toMatchObject({ error: 'R2 unavailable' })
    expect(alerted).toBeInstanceOf(Error)
  })
})
