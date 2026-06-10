// negative (input-validation) — runBackup must never throw and must surface a failed result
// with the run recorded as failed when an upstream seam misbehaves: a source that cannot list,
// a source that 404s mid-download, and a run store that cannot even open a row. Also coerces
// non-Error throws to a string message.
import { describe, it, expect } from 'vitest'
import { runBackup, type BackupSource, type BackupSink, type BackupRunStore } from '../orchestration'
import { type BackupObject } from '../core'

const obj = (path: string, size: number, version = 'v1'): BackupObject => ({ path, size, version })
const now = () => new Date('2026-06-03T12:00:00Z')

function baseFakes() {
  let failed: unknown
  const source: BackupSource = {
    list: async () => [obj('a', 1)],
    download: async () => new Uint8Array([1]),
  }
  const sink: BackupSink = {
    listKeys: async () => new Set<string>(),
    put: async () => {},
  }
  const store: BackupRunStore = {
    open: async () => ({ id: 'b1' }),
    complete: async () => {},
    fail: async (_id, d) => {
      failed = d
    },
  }
  return { source, sink, store, get failed() { return failed } }
}

describe('runBackup — negative seam failures', () => {
  it('returns failed (not throw) when the source cannot be listed, and records the failure', async () => {
    const f = baseFakes()
    f.source.list = async () => {
      throw new Error('source ENOENT')
    }
    const r = await runBackup({ source: f.source, sink: f.sink, store: f.store, now })
    expect(r.status).toBe('failed')
    expect(r.error).toBe('source ENOENT')
    expect(r.manifestChecksum).toBeNull()
    expect(f.failed).toMatchObject({ error: 'source ENOENT' })
  })

  it('returns failed when a listed object disappears before download (missing source object)', async () => {
    const f = baseFakes()
    f.source.list = async () => [obj('gone', 5)]
    f.source.download = async () => {
      throw new Error('object not found: gone')
    }
    const r = await runBackup({ source: f.source, sink: f.sink, store: f.store, now })
    expect(r.status).toBe('failed')
    expect(r.error).toMatch(/object not found/)
  })

  it('returns failed with a null backupId when the run store cannot open a row', async () => {
    const f = baseFakes()
    f.store.open = async () => {
      throw new Error('store unavailable')
    }
    const r = await runBackup({ source: f.source, sink: f.sink, store: f.store, now })
    expect(r.status).toBe('failed')
    expect(r.backupId).toBeNull() // never got an id; nothing to mark failed
    expect(r.error).toBe('store unavailable')
  })

  it('coerces non-Error throws to a string message', async () => {
    const f = baseFakes()
    f.sink.put = async () => {
      throw 'plain string failure'
    }
    const r = await runBackup({ source: f.source, sink: f.sink, store: f.store, now })
    expect(r.status).toBe('failed')
    expect(r.error).toBe('plain string failure')
  })
})
