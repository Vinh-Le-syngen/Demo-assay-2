#!/usr/bin/env node
// @sys/chat CLI — validates a chat configuration file.
// Usage: sys-chat [--config <path>]

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineChat } from './config'

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function fmtErr(e: unknown): string {
  const issues = (e as { issues?: { path: (string | number)[]; message: string }[] })?.issues
  if (Array.isArray(issues)) {
    return issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')
  }
  return `  ${(e as Error)?.message ?? String(e)}`
}

function main(): number {
  const configPath = resolve(arg('--config') ?? 'chat.config.json')
  
  if (!existsSync(configPath)) {
    console.error(`sys-chat: no config at ${configPath}`)
    return 1
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'))
    const config = defineChat(raw)
    console.log(`sys-chat: ok (turnPolicy: ${config.turnPolicy}, maxTurns: ${config.maxTurns})`)
    return 0
  } catch (e) {
    console.error(`sys-chat: invalid config (${configPath}):\n${fmtErr(e)}`)
    return 1
  }
}

process.exit(main())
