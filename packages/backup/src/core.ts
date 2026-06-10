// @sys/backup core (Recovery) — the generic, reusable pieces of SYS-BACKUP: incremental
// diff, deterministic manifest checksum, and freshness evaluation. Pure + perfected.
//
// WIP: the full orchestration (source→sink copy with injected storage/logger/alert
// seams) and the cross-language CLI are not generalized yet — see WIP.md. The Qarar
// implementation (apps/api/src/lib/backup.ts) remains canonical until this lands.

import { createHash } from 'node:crypto'

/** A backup-able object: a key/path, its size, and a version token for change detection. */
export type BackupObject = {
  path: string
  size: number
  /** etag (preferred) or updated_at — distinguishes changed content. */
  version: string
}

/**
 * Destination key for an object. The version is encoded into the key so a changed
 * source produces a NEW key (old versions retained, never overwritten — matches the
 * permanent-retention rule).
 */
export function keyFor(obj: BackupObject): string {
  return obj.version ? `${obj.path}#${obj.version}` : obj.path
}

/** Incremental diff: objects whose destination key is not already present. */
export function diffForBackup(
  objects: BackupObject[],
  existingKeys: Map<string, string> | Set<string>,
): BackupObject[] {
  return objects.filter((o) => !existingKeys.has(keyFor(o)))
}

/**
 * Deterministic manifest checksum over the full set: sha256 of sorted, JSON-encoded
 * [path, size] tuples. Stable regardless of listing order; the verification anchor.
 *
 * Each entry is `JSON.stringify([path, size])` rather than a delimiter-joined
 * "path:size" string. A raw delimiter join is forgeable: a path containing the field
 * separator (':') or the line separator ('\n') can reproduce the exact joined bytes of
 * a different, honest set — e.g. [{path:'a:1\nb', size:2}] would collide with
 * [{path:'a', size:1}, {path:'b', size:2}]. JSON escapes those characters, so tuple and
 * line boundaries are unambiguous and an attacker who controls object paths cannot craft
 * a tampered set that hashes identically to a legitimate manifest.
 */
export function manifestChecksum(objects: BackupObject[]): string {
  const lines = objects
    .map((o) => JSON.stringify([o.path, o.size]))
    .sort()
    .join('\n')
  return createHash('sha256').update(lines).digest('hex')
}

export type Freshness = { stale: boolean; ageHours: number }

/** Pure freshness check. A null last-success is always stale (age = Infinity). */
export function backupFreshness(
  lastSuccess: Date | string | null,
  now: Date,
  maxAgeHours = 25,
): Freshness {
  if (lastSuccess == null) return { stale: true, ageHours: Infinity }
  const last = lastSuccess instanceof Date ? lastSuccess : new Date(lastSuccess)
  const ageHours = (now.getTime() - last.getTime()) / (1000 * 60 * 60)
  return { stale: ageHours > maxAgeHours, ageHours }
}

export type FreshnessDecision = { alert: boolean; ageHours: number; reason: string }

/** Pure freshness-alert decision: alert when never backed up or stale. */
export function evaluateFreshness(
  lastSuccess: Date | string | null,
  now: Date,
  maxAgeHours = 25,
): FreshnessDecision {
  const { stale, ageHours } = backupFreshness(lastSuccess, now, maxAgeHours)
  if (lastSuccess == null) {
    return { alert: true, ageHours, reason: 'no successful backup on record' }
  }
  if (stale) {
    return {
      alert: true,
      ageHours,
      reason: `last successful backup is ${ageHours.toFixed(1)}h old (> ${maxAgeHours}h)`,
    }
  }
  return { alert: false, ageHours, reason: 'backup is fresh' }
}
