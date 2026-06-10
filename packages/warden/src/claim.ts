// @sys/warden claim — explicit lease for workers the harness can't see (humans, non-Claude agents).
// Mutual exclusion via an ATOMIC primitive: `mkdir` (POSIX-atomic; throws EEXIST if already held).
// Renewal is a touch of the claim dir; staleness is read from its mtime.

import { mkdirSync, writeFileSync, readFileSync, rmSync, statSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import type { WorktreeOwner } from './core'

/** Atomic claim marker inside a worktree. Consumers should gitignore it. */
export const CLAIM_DIRNAME = '.wt-claim.d'

export interface ClaimResult {
  ok: boolean
  reason?: string
}

interface ClaimRecord {
  schema: 1
  owner: string
  pid?: number
  claimedAtMs: number
}

function claimDir(worktreePath: string): string {
  return join(worktreePath, CLAIM_DIRNAME)
}

/**
 * Atomically claim a worktree. Succeeds only if unheld — `mkdir` is the atomic gate, so two
 * concurrent claimers cannot both win. Returns `{ ok: false }` if already claimed.
 */
export function claimWorktree(
  worktreePath: string,
  owner: string,
  opts: { pid?: number; nowMs: number },
): ClaimResult {
  const dir = claimDir(worktreePath)
  try {
    mkdirSync(dir) // atomic; EEXIST if already held
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return { ok: false, reason: 'already claimed' }
    throw e
  }
  const record: ClaimRecord = { schema: 1, owner, pid: opts.pid, claimedAtMs: opts.nowMs }
  writeFileSync(join(dir, 'owner.json'), JSON.stringify(record))
  return { ok: true }
}

/** Renew a held claim (heartbeat): bump the claim dir's mtime to `nowMs`. */
export function renewClaim(worktreePath: string, nowMs: number): void {
  const when = new Date(nowMs)
  utimesSync(claimDir(worktreePath), when, when)
}

/** Release a claim (idempotent). */
export function releaseWorktree(worktreePath: string): void {
  rmSync(claimDir(worktreePath), { recursive: true, force: true })
}

/** Read an explicit claim as a WorktreeOwner; `lastSeenMs` is the claim dir's mtime. Undefined if unclaimed. */
export function readClaim(worktreePath: string): WorktreeOwner | undefined {
  const dir = claimDir(worktreePath)
  try {
    const rec = JSON.parse(readFileSync(join(dir, 'owner.json'), 'utf8')) as ClaimRecord
    return {
      source: 'claim',
      owner: rec.owner,
      pid: rec.pid,
      startedAtMs: rec.claimedAtMs,
      lastSeenMs: statSync(dir).mtimeMs,
    }
  } catch {
    return undefined
  }
}
