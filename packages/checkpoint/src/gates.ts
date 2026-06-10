// @sys/checkpoint gate builders — reusable, configurable policy gates. Each returns a Gate
// (a named (GitState) => string[] check). Projects compose the subset they want; the gates
// themselves are generic. Mirrors @sys/warp's check-builder pattern.

import type { Gate, GitState } from './core'

/**
 * Block landing directly on a protected branch. For a push, checks `targetBranch`; for a
 * pre-commit context, checks the current `branch`. Encodes the "feature → staging → main,
 * only a human promotes to main" rule (cadre-os pre-push-guard).
 */
export function protectedBranchGate(opts: {
  branches: string[]
  /** Which branch to test: the push target (default) or the current branch. */
  against?: 'target' | 'current'
}): Gate {
  const protectedSet = new Set(opts.branches)
  const against = opts.against ?? 'target'
  return {
    name: 'protected-branch',
    run: (state: GitState) => {
      const branch = against === 'target' ? state.targetBranch : state.branch
      if (branch && protectedSet.has(branch)) {
        return [
          `direct ${against === 'target' ? 'push to' : 'commit on'} protected branch '${branch}' is not allowed (protected: ${opts.branches.join(', ')})`,
        ]
      }
      return []
    },
  }
}

/**
 * Require the commit author email to be in an allow-list. Encodes Qarar's Vercel constraint
 * (commits must be authored by sinuhe.arroyo@gmail.com or the deploy is blocked).
 */
export function authorGate(opts: { allowed: string[] }): Gate {
  const allowed = new Set(opts.allowed.map((e) => e.toLowerCase()))
  return {
    name: 'author',
    run: (state: GitState) => {
      const email = state.authorEmail?.toLowerCase()
      if (email && !allowed.has(email)) {
        return [`commit author '${state.authorEmail}' not in allow-list (${opts.allowed.join(', ')})`]
      }
      return []
    },
  }
}

/** Require a clean working tree (no uncommitted changes) — e.g. before a deploy/promotion. */
export function cleanTreeGate(): Gate {
  return {
    name: 'clean-tree',
    run: (state: GitState) =>
      state.isClean === false ? ['working tree is not clean (uncommitted changes present)'] : [],
  }
}

/**
 * Block staged changes to protected paths (string prefix or RegExp). Useful for files that must
 * only change through a controlled process (e.g. migrations already applied, lockfiles, secrets).
 */
export function protectedPathGate(opts: {
  paths: Array<string | RegExp>
  message?: string
}): Gate {
  return {
    name: 'protected-path',
    run: (state: GitState) => {
      const staged = state.stagedFiles ?? []
      const hits = staged.filter((f) =>
        opts.paths.some((p) => (typeof p === 'string' ? f.startsWith(p) : p.test(f))),
      )
      return hits.map((f) => opts.message ?? `staged change to protected path: ${f}`)
    },
  }
}
