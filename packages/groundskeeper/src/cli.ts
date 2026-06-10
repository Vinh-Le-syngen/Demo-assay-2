#!/usr/bin/env node
// @sys/groundskeeper CLI — `sys-groundskeeper [--strict] [--config groundskeeper.config.mjs]`.
// Loads a project's detector config, runs the hygiene sweep, prints the report, and
// (under --strict) exits non-zero when there are high-severity findings.

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runHousekeeping, evaluateHousekeeping, type GroundskeeperConfig } from './core'

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<number> {
  const strict = process.argv.includes('--strict')
  const configPath = resolve(arg('--config') ?? 'groundskeeper.config.mjs')
  if (!existsSync(configPath)) {
    console.error(`groundskeeper: no config at ${configPath}`)
    return strict ? 1 : 0
  }

  const mod: { default?: GroundskeeperConfig; config?: GroundskeeperConfig } = await import(
    pathToFileURL(configPath).href
  )
  const config = mod.default ?? mod.config
  if (!config || !Array.isArray(config.detectors)) {
    console.error('groundskeeper: config must export a default { detectors: [...] }')
    return strict ? 1 : 0
  }

  const report = await runHousekeeping(config, new Date().toISOString())
  const decision = evaluateHousekeeping(report)

  for (const f of report.findings) {
    console.log(`  [${f.severity}] ${f.detector}: ${f.subject} — ${f.detail}`)
  }
  console.log(`groundskeeper: ${decision.summary}`)
  return strict && decision.alert ? 1 : 0
}

main().then((code) => process.exit(code))
