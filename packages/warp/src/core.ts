// @sys/warp core — a config cross-validation harness (Governance). Projects register
// named checks (each returns a list of error strings); warp runs them all and aggregates.
// The checks themselves are project-specific and injected; the harness is generic.

export type Check = {
  name: string
  run: () => string[] | Promise<string[]>
}

export type CheckResult = { name: string; errors: string[] }

export type WarpReport = {
  results: CheckResult[]
  errorCount: number
}

export type WarpConfig = {
  checks: Check[]
}

/** Identity helper for authoring a typed warp config (`warp.config.mjs`). */
export function defineWarp(config: WarpConfig): WarpConfig {
  return config
}

/** Run every check and aggregate. Checks are independent; one failing never blocks others. */
export async function runWarp(config: WarpConfig): Promise<WarpReport> {
  const results: CheckResult[] = []
  for (const check of config.checks) {
    const errors = await check.run()
    results.push({ name: check.name, errors })
  }
  return { results, errorCount: results.reduce((n, r) => n + r.errors.length, 0) }
}

export function isClean(report: WarpReport): boolean {
  return report.errorCount === 0
}
