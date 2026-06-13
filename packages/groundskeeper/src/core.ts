// @sys/groundskeeper core (Observability) — operational-hygiene detectors. Projects
// register detectors (pure functions returning Findings); the harness runs them,
// summarizes, and decides whether to alert. Ported from SYS-GROUNDSKEEPER.

import { z } from 'zod'

export type Severity = 'info' | 'warning' | 'high'

export interface Finding {
  detector: string
  severity: Severity
  subject: string
  detail: string
}

export interface Detector {
  name: string
  run: () => Finding[] | Promise<Finding[]>
}

export interface GroundskeeperConfig {
  detectors: Detector[]
}

const detectorRunFn = z.custom<Detector['run']>((v) => typeof v === 'function', 'must be a function')

export const groundskeeperConfigSchema = z.object({
  detectors: z.array(z.object({ name: z.string().min(1), run: detectorRunFn })),
})

export type GroundskeeperConfigInput = z.input<typeof groundskeeperConfigSchema>

/** Validates a groundskeeper config. Throws (ZodError) on invalid input. */
export function defineGroundskeeper(config: GroundskeeperConfig): GroundskeeperConfig {
  return groundskeeperConfigSchema.parse(config) as GroundskeeperConfig
}

export interface HousekeepingReport {
  ranAt: string
  findings: Finding[]
  counts: Record<string, number>
  highCount: number
}

/** Aggregate findings into a report. */
export function summarize(findings: Finding[], ranAtIso: string): HousekeepingReport {
  const counts: Record<string, number> = {}
  for (const f of findings) counts[f.detector] = (counts[f.detector] ?? 0) + 1
  return {
    ranAt: ranAtIso,
    findings,
    counts,
    highCount: findings.filter((f) => f.severity === 'high').length,
  }
}

/** Run every detector and summarize. */
export async function runHousekeeping(
  config: GroundskeeperConfig,
  ranAtIso: string,
): Promise<HousekeepingReport> {
  const findings: Finding[] = []
  for (const detector of config.detectors) {
    findings.push(...(await detector.run()))
  }
  return summarize(findings, ranAtIso)
}

export interface HousekeepingDecision {
  alert: boolean
  level: 'error' | 'warning' | 'info'
  highCount: number
  highByDetector: Record<string, number>
  highDetectors: string[]
  summary: string
}

/**
 * Decide whether a run should alert. High-severity findings → alert/error; otherwise
 * info (warnings are surfaced via the report, not paged). Pure. (Ported verbatim.)
 */
export function evaluateHousekeeping(report: HousekeepingReport): HousekeepingDecision {
  const highFindings = report.findings.filter((f) => f.severity === 'high')
  const highByDetector: Record<string, number> = {}
  for (const f of highFindings) {
    highByDetector[f.detector] = (highByDetector[f.detector] ?? 0) + 1
  }
  const highDetectors = Object.keys(highByDetector)

  if (report.highCount > 0) {
    const parts = highDetectors.map((d) => `${d}=${highByDetector[d]}`).join(', ')
    return {
      alert: true,
      level: 'error',
      highCount: report.highCount,
      highByDetector,
      highDetectors,
      summary: `${report.highCount} high-severity finding(s): ${parts}`,
    }
  }

  const total = report.findings.length
  return {
    alert: false,
    level: 'info',
    highCount: 0,
    highByDetector,
    highDetectors,
    summary: total > 0 ? `no high-severity findings (${total} lower-severity)` : 'no findings',
  }
}
