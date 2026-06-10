// @sys/warden adapters — node I/O that feeds the pure core: enumerate git worktrees, read the
// agent harness's native session registry (~/.claude/sessions/<pid>.json), and decide process
// liveness. Kept separate from ./core so the decisions stay pure/testable.

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { IsAlive, WorktreeOwner, WorktreeRecord } from './core'
import { readClaim } from './claim'

/** Grace for an abandoned worktree to become reclaimable (ms). */
export const DEFAULT_STALE_GRACE_MS = 180_000

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, { encoding: 'utf8', cwd }).trim()
}

/**
 * Active-owner policy: a claim is held until released (an explicit lease isn't tied to a live
 * process); a session is active iff its pid is alive AND the same process that recorded the
 * session start (PID-reuse safe). Time is compared via `ps -o lstart=` → Date.parse (epoch,
 * timezone-independent; `lstart` is portable across BSD/macOS + Linux, unlike Linux-only `etimes`).
 */
export const isAlive: IsAlive = (o: WorktreeOwner): boolean => {
  if (o.source === 'claim') return true
  if (o.pid == null) return false
  try {
    process.kill(o.pid, 0)
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM' // exists but not ours → alive
  }
  if (o.startedAtMs == null) return true
  try {
    const lstart = execFileSync('ps', ['-p', String(o.pid), '-o', 'lstart='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const procStartMs = Date.parse(lstart)
    if (Number.isNaN(procStartMs)) return true
    return Math.abs(procStartMs - o.startedAtMs) <= 300_000
  } catch {
    return true
  }
}

/** All git worktrees of the repo at `cwd` (or process cwd). */
export function gitWorktrees(cwd?: string): { path: string; branch: string }[] {
  return git(['worktree', 'list', '--porcelain'], cwd)
    .split('\n\n')
    .filter(Boolean)
    .map((block) => ({
      path: block.match(/^worktree (.+)$/m)?.[1] ?? '',
      branch:
        block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? (/^detached$/m.test(block) ? '(detached)' : '?'),
    }))
    .filter((w) => w.path)
}

/** Native Claude Code sessions: ~/.claude/sessions/<pid>.json → owner keyed by cwd. */
export function sessionOwners(): { cwd: string; owner: WorktreeOwner }[] {
  const dir = join(homedir(), '.claude', 'sessions')
  let files: string[] = []
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  const out: { cwd: string; owner: WorktreeOwner }[] = []
  for (const f of files) {
    try {
      const j = JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
        pid?: number
        cwd?: string
        startedAt?: number
        entrypoint?: string
        kind?: string
      }
      if (!j.cwd || j.pid == null) continue
      out.push({
        cwd: j.cwd,
        owner: {
          source: 'session',
          owner: `${j.entrypoint ?? '?'}${j.kind ? `/${j.kind}` : ''}`,
          pid: j.pid,
          startedAtMs: j.startedAt,
          lastSeenMs: j.startedAt,
        },
      })
    } catch {
      /* skip malformed / schema drift */
    }
  }
  return out
}

/** Build the full record set: each git worktree + its owner (live session preferred, else claim). */
export function collectRecords(cwd?: string): WorktreeRecord[] {
  const sessions = sessionOwners()
  return gitWorktrees(cwd).map((wt) => {
    const inWt = sessions.filter((s) => s.cwd === wt.path || s.cwd.startsWith(`${wt.path}/`)).map((s) => s.owner)
    const owner = inWt.find(isAlive) ?? inWt[0] ?? readClaim(wt.path)
    return { path: wt.path, name: basename(wt.path), branch: wt.branch, owner }
  })
}

/** Absolute path of the worktree containing `cwd` (or process cwd). */
export function currentWorktree(cwd?: string): string {
  return git(['rev-parse', '--show-toplevel'], cwd)
}
