// negative (input-validation) — the pure/run layer must tolerate degenerate input without
// throwing: an empty object set still yields a stable checksum and zero totals through a full
// run, and objects with a missing/zero size must not corrupt the byte total.
import { describe, it, expect } from 'vitest'
import { runBackup, type BackupSource, type BackupSink, type BackupRunStore } from '../orchestration'
import { manifestChecksum, type BackupObject } from '../core'

const obj = (path: string, size: number, version = 'v1'): BackupObject => ({ path, size, version })
const now = () => new Date('2026-06-03T12:00:00Z')

function baseFakes() {
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
    fail: async () => {},
  }
  return { source, sink, store }
}

describe('pure layer — degenerate input', () => {
  it('an empty object set yields a stable checksum and zero totals through a run', async () => {
    const f = baseFakes()
    f.source.list = async () => []
    const r = await runBackup({ source: f.source, sink: f.sink, store: f.store, now })
    expect(r.status).toBe('completed')
    expect(r.objectCount).toBe(0)
    expect(r.totalBytes).toBe(0)
    expect(r.copied).toEqual([])
    expect(r.manifestChecksum).toBe(manifestChecksum([]))
  })

  it('tolerates objects with a missing/zero size when totalling bytes', async () => {
    const f = baseFakes()
    f.source.list = async () => [obj('a', 0), { path: 'b', size: undefined as unknown as number, version: 'v1' }]
    const r = await runBackup({ source: f.source, sink: f.sink, store: f.store, now })
    expect(r.status).toBe('completed')
    expect(r.totalBytes).toBe(0) // size || 0 guard
  })
})
