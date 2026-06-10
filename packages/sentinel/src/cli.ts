#!/usr/bin/env node
// @sys/sentinel CLI — `sys-sentinel [--strict] [--config sentinel.config.mjs]`. Loads a
// project's sentinel config (probes + critical set), runs the health check, prints the
// report, and (under --strict) exits non-zero when the result is alert-worthy.

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runHealth, healthAlert, type SentinelConfig } from './core'

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<number> {
  const strict = process.argv.includes('--strict')
  const configPath = resolve(arg('--config') ?? 'sentinel.config.mjs')
  if (!existsSync(configPath)) {
    console.error(`sentinel: no config at ${configPath}`)
    return strict ? 1 : 0
  }

  const mod: { default?: SentinelConfig; config?: SentinelConfig } = await import(
    pathToFileURL(configPath).href
  )
  const config = mod.default ?? mod.config
  if (!config || !Array.isArray(config.probes)) {
    console.error('sentinel: config must export a default { probes: [...] }')
    return strict ? 1 : 0
  }

  const report = await runHealth(config)
  const { alert, summary } = healthAlert(report)
  for (const d of report.dependencies) {
    console.log(`  ${d.status === 'up' ? '✓' : d.status === 'not_configured' ? '–' : '✗'} ${d.name}${d.detail ? ` (${d.detail})` : ''}`)
  }
  console.log(`sentinel: ${report.healthy ? 'healthy' : 'UNHEALTHY'} — ${summary}`)
  return strict && alert ? 1 : 0
}

main().then((code) => process.exit(code))
