#!/usr/bin/env node
// @sys/checkpoint CLI — `sys-checkpoint [--config checkpoint.config.mjs] [--strict] [--target <branch>]`.
// Gathers the current git state (branch, author, staged files, clean) and runs a project's
// checkpoint config (a set of gates, typically built with @sys/checkpoint/gates). Exits
// non-zero under --strict when any gate reports a violation. Intended for git hooks / CI.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runCheckpoint, passed, type Gate, type GitState } from './core'

function flagValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function git(args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch {
    return undefined
  }
}

function gatherState(): GitState {
  const staged = git(['diff', '--cached', '--name-only'])
  const porcelain = git(['status', '--porcelain'])
  return {
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    targetBranch: flagValue('--target'),
    authorEmail: git(['config', 'user.email']),
    stagedFiles: staged ? staged.split('\n').filter(Boolean) : [],
    isClean: porcelain !== undefined ? porcelain.length === 0 : undefined,
  }
}

async function loadGates(): Promise<Gate[] | null> {
  const configPath = resolve(flagValue('--config') ?? 'checkpoint.config.mjs')
  if (!existsSync(configPath)) {
    console.error(`checkpoint: no config at ${configPath}`)
    return null
  }
  const mod: { default?: { gates?: Gate[] }; config?: { gates?: Gate[] } } = await import(
    pathToFileURL(configPath).href
  )
  const config = mod.default ?? mod.config
  if (!config || !Array.isArray(config.gates)) {
    console.error('checkpoint: config must export default { gates: [...] }')
    return null
  }
  return config.gates
}

async function main(): Promise<number> {
  const strict = process.argv.includes('--strict')
  const gates = await loadGates()
  if (!gates) return strict ? 1 : 0

  const report = runCheckpoint(gates, gatherState())
  if (passed(report)) {
    console.log(`checkpoint: ok (${report.results.length} gates passed)`)
    return 0
  }

  for (const r of report.results) {
    if (r.violations.length) console.error(`\ncheckpoint: ${r.name}:\n  ${r.violations.join('\n  ')}`)
  }
  console.error(`\ncheckpoint: ${report.violationCount} violation(s) across ${report.results.length} gates`)
  return strict ? 1 : 0
}

main().then((code) => process.exit(code))
