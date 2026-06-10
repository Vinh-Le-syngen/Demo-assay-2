// @sys/backup — incremental backup (Recovery). Pure primitives (diff, manifest checksum,
// freshness) + a seam-injected orchestration (runBackup) that copies a source to a sink
// idempotently. Projects supply source/sink/store/logger/alert adapters.
export * from './core'
export * from './orchestration'
