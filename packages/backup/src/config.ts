import { z } from 'zod'
import type { BackupSource, BackupSink, BackupRunStore } from './orchestration'

export const backupConfigSchema = z.object({
  maxAgeHours: z.number().int().positive().default(25),
})

export type BackupConfigInput = z.input<typeof backupConfigSchema>

export type BackupSeams = {
  source: BackupSource
  sink: BackupSink
  store: BackupRunStore
  logger?: { info(msg: string, meta?: Record<string, unknown>): void; error(msg: string, meta?: Record<string, unknown>): void }
  alert?: { capture(err: unknown, meta?: Record<string, unknown>): void }
  now?: () => Date
}

export type BackupConfig = z.infer<typeof backupConfigSchema> & BackupSeams

export function defineBackup(input: BackupConfigInput & BackupSeams): BackupConfig {
  const parsed = backupConfigSchema.parse(input)
  return { ...parsed, source: input.source, sink: input.sink, store: input.store, logger: input.logger, alert: input.alert, now: input.now }
}
