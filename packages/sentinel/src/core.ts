// @sys/sentinel core — health monitoring (Observability). Runs a set of dependency
// probes, derives overall health from a configured "critical" set, and decides whether
// the result is alert-worthy. Probes are project-specific and injected.

export type DepStatus = {
  name: string
  status: 'up' | 'down' | 'not_configured'
  detail?: string
}

export type HealthReport = {
  healthy: boolean
  dependencies: DepStatus[]
}

export type Probe = {
  name: string
  run: () => DepStatus | Promise<DepStatus>
}

export type SentinelConfig = {
  probes: Probe[]
  /** Names whose `down` makes the system unhealthy. Default: every probe is critical. */
  critical?: string[]
}

export function defineSentinel(config: SentinelConfig): SentinelConfig {
  return config
}

/** Run all probes; `healthy` is false if any CRITICAL dependency is not 'up'. */
export async function runHealth(config: SentinelConfig): Promise<HealthReport> {
  const dependencies: DepStatus[] = []
  for (const probe of config.probes) {
    dependencies.push(await probe.run())
  }
  const critical = new Set(config.critical ?? dependencies.map((d) => d.name))
  const healthy = dependencies.every((d) => !critical.has(d.name) || d.status === 'up')
  return { healthy, dependencies }
}

/**
 * Decide whether a report is alert-worthy. Alerts when unhealthy or any dependency is
 * down; `summary` names the offenders. Pure. (Ported from SYS-SENTINEL.)
 */
export function healthAlert(report: HealthReport): { alert: boolean; summary: string } {
  const down = report.dependencies.filter((d) => d.status === 'down')
  const alert = !report.healthy || down.length > 0
  const summary = down.length
    ? down.map((d) => `${d.name}: ${d.detail ?? 'down'}`).join('; ')
    : report.healthy
      ? 'healthy'
      : 'unhealthy (critical dependency down)'
  return { alert, summary }
}
