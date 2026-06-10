#!/usr/bin/env node
// @sys/backup CLI — `sys-backup [--config backup.config.mjs] [--check-freshness] [--strict]`.
// Loads a project's backup config (which constructs the source/sink/store adapters) and
// either runs one backup or checks freshness. Under --strict, exits non-zero on a failed
// run / stale backup.

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { evaluateFreshness } from './core'
import {
  runBackup,
  type BackupSource,
  type BackupSink,
  type BackupRunStore,
  type BackupLogger,
  type BackupAlert,
} from './orchestration'

type BackupCliConfig = {
  source: BackupSource
  sink: BackupSink
  store: BackupRunStore
  logger?: BackupLogger
  alert?: BackupAlert
  /** For --check-freshness: the latest successful backup time (or null if none). */
  lastSuccess?: () => Promise<Date | string | null> | Date | string | null
  maxAgeHours?: number
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<number> {
  const strict = process.argv.includes('--strict')
  const checkFreshness = process.argv.includes('--check-freshness')
  const configPath = resolve(arg('--config') ?? 'backup.config.mjs')
  if (!existsSync(configPath)) {
    console.error(`backup: no config at ${configPath}`)
    return strict ? 1 : 0
  }

  const mod: { default?: BackupCliConfig; config?: BackupCliConfig } = await import(
    pathToFileURL(configPath).href
  )
  const config = mod.default ?? mod.config
  if (!config || !config.source || !config.sink || !config.store) {
    console.error('backup: config must export a default { source, sink, store }')
    return strict ? 1 : 0
  }

  if (checkFreshness) {
    const last = config.lastSuccess ? await config.lastSuccess() : null
    const decision = evaluateFreshness(last, new Date(), config.maxAgeHours ?? 25)
    console.log(`backup freshness: ${decision.reason}`)
    return strict && decision.alert ? 1 : 0
  }

  const result = await runBackup({
    source: config.source,
    sink: config.sink,
    store: config.store,
    logger: config.logger,
    alert: config.alert,
  })
  console.log(
    `backup: ${result.status} — ${result.objectCount} objects, ${result.copied.length} copied` +
      (result.error ? `, error: ${result.error}` : ''),
  )
  return strict && result.status === 'failed' ? 1 : 0
}

main().then((code) => process.exit(code))
