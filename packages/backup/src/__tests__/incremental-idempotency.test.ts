// integration (intra-system) — runBackup composed with diff/keyFor/manifestChecksum and
// stateful in-memory source/sink/store fakes. Exercises the idempotency contract: a second
// run against a sink that now holds the first run's keys copies nothing, yet still records a
// stable manifest checksum over the full set. This is the real seam wiring, not a stub.
import { describe, it, expect } from 'vitest'
import { runBackup, type BackupSource, type BackupSink, type BackupRunStore } from '../orchestration'
import { keyFor, type BackupObject } from '../core'

const obj = (path: string, size: number, version = 'v1'): BackupObject => ({ path, size, version })
const now = () => new Date('2026-06-03T12:00:00Z')

/** A sink whose listKeys reflects everything put() has accepted — stateful across runs. */
function statefulFakes(objects: BackupObject[]) {
  const stored = new Set<string>()
  const completions: unknown[] = []
  let counter = 0
  const source: BackupSource = {
    list: async () => objects,
    download: async () => new Uint8Array([0xab, 0xcd]),
  }
  const sink: BackupSink = {
    listKeys: async () => new Set(stored),
    put: async (key) => {
      stored.add(key)
    },
  }
  const store: BackupRunStore = {
    open: async () => ({ id: `run-${++counter}` }),
    complete: async (_id, data) => {
      completions.push(data)
    },
    fail: async () => {},
  }
  return { source, sink, store, stored, completions }
}

describe('runBackup — incremental idempotency across runs', () => {
  it('first run copies everything, second run copies nothing, checksum stable', async () => {
    const objects = [obj('a', 10), obj('b', 20), obj('c', 30)]
    const f = statefulFakes(objects)

    const first = await runBackup({ source: f.source, sink: f.sink, store: f.store, now })
    expect(first.status).toBe('completed')
    expect(first.copied.sort()).toEqual([keyFor(obj('a', 10)), keyFor(obj('b', 20)), keyFor(obj('c', 30))].sort())
    expect(f.stored.size).toBe(3)

    const second = await runBackup({ source: f.source, sink: f.sink, store: f.store, now })
    expect(second.status).toBe('completed')
    expect(second.copied).toEqual([]) // nothing new to copy — idempotent
    expect(second.objectCount).toBe(3) // totals still over the FULL set
    expect(second.totalBytes).toBe(60)
    expect(second.manifestChecksum).toBe(first.manifestChecksum) // identical source → identical anchor
  })

  it('a new version of an existing object is copied incrementally on the next run', async () => {
    const f = statefulFakes([obj('a', 10, 'v1')])
    await runBackup({ source: f.source, sink: f.sink, store: f.store, now })
    expect(f.stored.has('a#v1')).toBe(true)

    // source now reports 'a' at v2 — same path, new version token
    f.source.list = async () => [obj('a', 11, 'v2')]
    const r = await runBackup({ source: f.source, sink: f.sink, store: f.store, now })
    expect(r.copied).toEqual(['a#v2']) // only the changed version
    expect(f.stored.has('a#v1')).toBe(true) // old version retained, never overwritten
    expect(f.stored.has('a#v2')).toBe(true)
  })
})
