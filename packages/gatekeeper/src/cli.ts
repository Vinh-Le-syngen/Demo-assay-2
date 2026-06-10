#!/usr/bin/env node
// @sys/gatekeeper CLI — emit a promotion verdict from the command line.
//   sys-gatekeeper --from staging --to main [--tests-green] [--risk normal|risky|critical]
//                  [--approved] [--config gatekeeper.config.mjs]
// Policy defaults to the canonical staging-first policy; --config overrides it (a module whose
// default export is a PromotionPolicy). Exit codes: ALLOW=0, DENY=1, REVIEW=2 — so a promote
// script can branch on "needs a human" vs "blocked" vs "go".

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  promotionVerdict,
  stagingFirstPolicy,
  type PromotionPolicy,
  type Risk,
} from './core'

function flagValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const hasFlag = (flag: string): boolean => process.argv.includes(flag)

async function loadPolicy(): Promise<PromotionPolicy> {
  const configPath = flagValue('--config')
  if (!configPath) return stagingFirstPolicy()
  const abs = resolve(configPath)
  if (!existsSync(abs)) {
    console.error(`gatekeeper: no config at ${abs} — falling back to staging-first policy`)
    return stagingFirstPolicy()
  }
  const mod: { default?: PromotionPolicy; policy?: PromotionPolicy } = await import(
    pathToFileURL(abs).href
  )
  return mod.default ?? mod.policy ?? stagingFirstPolicy()
}

async function main(): Promise<number> {
  const from = flagValue('--from')
  const to = flagValue('--to')
  if (!from || !to) {
    console.error('usage: sys-gatekeeper --from <branch> --to <branch> [--tests-green] [--risk <normal|risky|critical>] [--approved] [--config <file>]')
    return 1
  }
  const risk = (flagValue('--risk') ?? 'normal') as Risk
  const policy = await loadPolicy()

  const verdict = promotionVerdict(
    { from, to, testsGreen: hasFlag('--tests-green'), risk, humanApproved: hasFlag('--approved') },
    policy,
  )

  const line = `gatekeeper: ${verdict.decision} (${from} → ${to})`
  if (verdict.decision === 'ALLOW') console.log(line)
  else console.error(line)
  for (const r of verdict.reasons) console.error(`  - ${r}`)

  return verdict.decision === 'ALLOW' ? 0 : verdict.decision === 'DENY' ? 1 : 2
}

main().then((code) => process.exit(code))
