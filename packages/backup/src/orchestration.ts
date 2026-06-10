// @sys/backup orchestration (Recovery) — one incremental backup run, generalized from
// Qarar's runStorageBackup. The source, sink, run-record store, logger, and alert are all
// injected seams, so the real logic is unit-tested against in-memory fakes (not stubs).
// Idempotent: re-running copies only new/changed objects. Never throws — returns a result.

import { diffForBackup, keyFor, manifestChecksum, type BackupObject } from './core'

/** Where objects are read from (e.g. Supabase Storage). */
export interface BackupSource {
  list(): Promise<BackupObject[]>
  download(path: string): Promise<Uint8Array>
}

/** Where objects are written to (e.g. S3/R2). `listKeys` returns existing destination keys. */
export interface BackupSink {
  listKeys(): Promise<Set<string>>
  put(key: string, body: Uint8Array): Promise<void>
}

/** Records a run (running → completed/failed) so a crash mid-run is visible. */
export interface BackupRunStore {
  open(meta: { startedAt: string }): Promise<{ id: string }>
  complete(
    id: string,
    data: {
      completedAt: string
      objectCount: number
      totalBytes: number
      manifestChecksum: string
      copied: number
    },
  ): Promise<void>
  fail(id: string, data: { error: string; completedAt: string }): Promise<void>
}

export interface BackupLogger {
  info(obj: unknown, msg: string): void
  error(obj: unknown, msg: string): void
}

export interface BackupAlert {
  capture(err: Error, ctx?: Record<string, unknown>): void
}

export type BackupResult = {
  backupId: string | null
  status: 'completed' | 'failed'
  objectCount: number
  totalBytes: number
  manifestChecksum: string | null
  copied: string[]
  error?: string
}

export async function runBackup(opts: {
  source: BackupSource
  sink: BackupSink
  store: BackupRunStore
  logger?: BackupLogger
  alert?: BackupAlert
  now?: () => Date
}): Promise<BackupResult> {
  const now = opts.now ?? (() => new Date())
  const startedAt = now().toISOString()
  let backupId: string | null = null

  try {
    // 1. Open a 'running' row first so a crash mid-run is visible as non-completed.
    const opened = await opts.store.open({ startedAt })
    backupId = opened.id

    // 2. Enumerate source + destination, compute the incremental work.
    const objects = await opts.source.list()
    const existing = await opts.sink.listKeys()
    const toCopy = diffForBackup(objects, existing)

    // 3. Copy each new/changed object.
    const copied: string[] = []
    for (const obj of toCopy) {
      const body = await opts.source.download(obj.path)
      const key = keyFor(obj)
      await opts.sink.put(key, body)
      copied.push(key)
    }

    // 4. Verification anchor + totals over the FULL set.
    const checksum = manifestChecksum(objects)
    const totalBytes = objects.reduce((sum, o) => sum + (o.size || 0), 0)
    await opts.store.complete(backupId, {
      completedAt: now().toISOString(),
      objectCount: objects.length,
      totalBytes,
      manifestChecksum: checksum,
      copied: copied.length,
    })

    opts.logger?.info(
      { backupId, objectCount: objects.length, copied: copied.length, totalBytes },
      'backup completed',
    )
    return {
      backupId,
      status: 'completed',
      objectCount: objects.length,
      totalBytes,
      manifestChecksum: checksum,
      copied,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (backupId) {
      try {
        await opts.store.fail(backupId, { error: message, completedAt: now().toISOString() })
      } catch (markErr) {
        opts.logger?.error({ err: markErr, backupId }, 'failed to mark backup failed')
      }
    }
    opts.logger?.error({ err, backupId }, `backup failed: ${message}`)
    opts.alert?.capture(err instanceof Error ? err : new Error(message), { backupId })
    return {
      backupId,
      status: 'failed',
      objectCount: 0,
      totalBytes: 0,
      manifestChecksum: null,
      copied: [],
      error: message,
    }
  }
}
