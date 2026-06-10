#!/usr/bin/env node
// @sys/warp CLI — `sys-warp [--strict] [--config warp.config.mjs]`. Loads a project's
// warp config module (which composes checks, often with @sys/warp builders), runs it,
// reports, and exits non-zero under --strict when any check fails.

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runWarp, isClean, type WarpConfig } from './core'

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<number> {
  const strict = process.argv.includes('--strict')
  const configPath = resolve(arg('--config') ?? 'warp.config.mjs')
  if (!existsSync(configPath)) {
    console.error(`warp: no config at ${configPath}`)
    return strict ? 1 : 0
  }

  const mod: { default?: WarpConfig; config?: WarpConfig } = await import(
    pathToFileURL(configPath).href
  )
  const config = mod.default ?? mod.config
  if (!config || !Array.isArray(config.checks)) {
    console.error(`warp: config must export a default { checks: [...] }`)
    return strict ? 1 : 0
  }

  const report = await runWarp(config)
  if (isClean(report)) {
    console.log(`warp: ok (${report.results.length} checks passed)`)
    return 0
  }

  for (const r of report.results) {
    if (r.errors.length) {
      console.error(`\nwarp: ${r.name}:\n  ${r.errors.join('\n  ')}`)
    }
  }
  console.error(`\nwarp: ${report.errorCount} problem(s) across ${report.results.length} checks`)
  return strict ? 1 : 0
}

main().then((code) => process.exit(code))
