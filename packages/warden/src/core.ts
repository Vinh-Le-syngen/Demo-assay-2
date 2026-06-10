// @sys/warden core — "which agent owns which git worktree", as pure decisions that REUSE the
// platform's existing engines:
//   • liveness  → @sys/sentinel  (each worktree is a health probe: owned+alive = up)
//   • reclaim   → @sys/groundskeeper (abandoned worktrees aged past a grace window)
//
// Pure & injectable: process-liveness and the clock are passed in, so the classification is
// unit-testable without real processes. The node I/O (./adapters, ./claim) supplies the rest.

import { runHealth, type DepStatus, type HealthReport, type Probe } from '@sys/sentinel'
import { agingDetector, type Finding } from '@sys/groundskeeper'

const DAY_MS = 86_400_000

/** Who holds a worktree. `session` = native Claude Code session; `claim` = explicit lease (human/non-Claude worker). */
export type OwnerSource = 'session' | 'claim'

export interface WorktreeOwner {
  source: OwnerSource
  /** Human-readable identity (session entrypoint, agent id, or claimer). */
  owner: string
  pid?: number
  /** When the owning process/claim began (epoch ms). Confirms process identity (PID-reuse guard). */
  startedAtMs?: number
  /** Last observation: session-file or claim-dir mtime (epoch ms). Drives staleness. */
  lastSeenMs?: number
}

export interface WorktreeRecord {
  path: string
  name: string
  branch: string
  /** undefined → nobody owns it (free). */
  owner?: WorktreeOwner
}

export type WorktreeState = 'live' | 'stale' | 'free'

export interface WorktreeStatus extends WorktreeRecord {
  state: WorktreeState
  detail: string
}

/** Injected liveness check — true iff the owner is still active (sessions: live process; claims: held). */
export type IsAlive = (owner: WorktreeOwner) => boolean

/**
 * Per-worktree liveness probe for @sys/sentinel.
 *   owned + alive → up · owned + gone → down · free → not_configured
 */
export function ownershipProbes(records: WorktreeRecord[], isAlive: IsAlive): Probe[] {
  return records.map((r): Probe => ({
    name: r.name,
    run: (): DepStatus => {
      if (!r.owner) return { name: r.name, status: 'not_configured', detail: 'free' }
      return isAlive(r.owner)
        ? { name: r.name, status: 'up', detail: `${r.owner.owner} (${r.owner.source})` }
        : { name: r.name, status: 'down', detail: `owner gone: ${r.owner.owner}` }
    },
  }))
}

/**
 * Worktree-fleet health via @sys/sentinel. Only *owned* worktrees are critical, so `healthy`
 * is false exactly when some worktree has been abandoned (owner gone); free worktrees never
 * fail the report. Reuses the same `runHealth` the API health endpoint uses.
 */
export function ownershipHealth(records: WorktreeRecord[], isAlive: IsAlive): Promise<HealthReport> {
  return runHealth({
    probes: ownershipProbes(records, isAlive),
    critical: records.filter((r) => r.owner).map((r) => r.name),
  })
}

/**
 * Reclaimable worktrees via @sys/groundskeeper. Of the worktrees whose owner is gone, flag those
 * not seen for longer than `graceMs` (a recently-dead owner is "settling", not yet reclaimable).
 * Reuses the same `agingDetector` the housekeeping crons use.
 */
export function reclaimableFindings(
  records: WorktreeRecord[],
  opts: { nowMs: number; graceMs: number; isAlive: IsAlive },
): Finding[] {
  const abandoned = records.filter((r) => r.owner && !opts.isAlive(r.owner))
  return agingDetector<WorktreeRecord>('reclaimable-worktrees', {
    rows: () => abandoned,
    nowMs: opts.nowMs,
    thresholdDays: opts.graceMs / DAY_MS,
    timestamp: (r: WorktreeRecord) => (r.owner?.lastSeenMs != null ? new Date(r.owner.lastSeenMs).toISOString() : null),
    severity: 'warning',
    subject: (r: WorktreeRecord) => r.name,
    detail: (r: WorktreeRecord) => `owner ${r.owner?.owner ?? '?'} gone — reclaimable (branch ${r.branch})`,
  }).run() as Finding[]
}

/** Plain per-worktree classification for display: live | stale | free. */
export function classifyWorktrees(records: WorktreeRecord[], isAlive: IsAlive): WorktreeStatus[] {
  return records.map((r): WorktreeStatus => {
    if (!r.owner) return { ...r, state: 'free', detail: '-' }
    if (isAlive(r.owner)) return { ...r, state: 'live', detail: `${r.owner.owner} (${r.owner.source})` }
    return { ...r, state: 'stale', detail: `owner gone: ${r.owner.owner}` }
  })
}
