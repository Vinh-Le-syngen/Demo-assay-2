// @sys/checkpoint core — a git-safety gate harness (Governance). A gate inspects an injected
// GitState and returns a list of violation strings; the harness runs every gate and aggregates.
// Pure and IO-free: the project (or the CLI) gathers the GitState from git and supplies it.
// Extracted from cadre-os SYS-CHECKPOINT (pre-push-guard / pre-commit chain).

/** A snapshot of the git situation a gate decides on. All fields optional so a gate can run
 *  with only what it needs (a pre-commit gate has no targetBranch; a pre-push gate does). */
export type GitState = {
  /** Current local branch (e.g. from `git rev-parse --abbrev-ref HEAD`). */
  branch?: string
  /** For a push: the remote branch being pushed to (the ref's short name). */
  targetBranch?: string
  /** Author email of the pending commit (e.g. from `git config user.email`). */
  authorEmail?: string
  /** Files staged for the pending commit (e.g. `git diff --cached --name-only`). */
  stagedFiles?: string[]
  /** Whether the working tree is clean (no uncommitted changes). */
  isClean?: boolean
}

/** A single named policy check. Returns [] when satisfied, else one string per violation. */
export type Gate = {
  name: string
  run: (state: GitState) => string[]
}

export type GateResult = { name: string; violations: string[] }

export type CheckpointReport = {
  results: GateResult[]
  violationCount: number
}

/** Identity helper for authoring a typed checkpoint config (`checkpoint.config.mjs`). */
export function defineCheckpoint(config: { gates: Gate[] }): { gates: Gate[] } {
  return config
}

/** Run every gate against the state and aggregate. Gates are independent; one failing never
 *  prevents the others from running (so a single run reports ALL violations at once). */
export function runCheckpoint(gates: Gate[], state: GitState): CheckpointReport {
  const results: GateResult[] = gates.map((g) => ({ name: g.name, violations: g.run(state) }))
  return { results, violationCount: results.reduce((n, r) => n + r.violations.length, 0) }
}

export function passed(report: CheckpointReport): boolean {
  return report.violationCount === 0
}
