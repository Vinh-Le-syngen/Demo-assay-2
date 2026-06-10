#!/usr/bin/env node
// @sys/atlas CLI — `sys-atlas <command> [--config atlas.config.mjs] [--strict] [args...]`.
// Loads a project's atlas config module (which supplies the parsed dependency graph, e.g. from
// the project's own dependency-graph.yaml) and runs one of:
//   affected <input...>      transitive impact set of changed files/concepts
//   validate                 referential-integrity check of the graph
//   propagation <changed...> changed files whose declared dependents weren't also changed
// Exits non-zero under --strict when validate finds errors or propagation finds gaps.

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  affected,
  validateGraph,
  propagationGaps,
  orphanConsumedConcepts,
  type DependencyGraph,
} from './core'

type AtlasConfig = { graph: DependencyGraph; exempt?: string[] }

function flagValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** Positional args after the command, with flags (and --config's value) removed. */
function positionals(): string[] {
  const out: string[] = []
  const argv = process.argv.slice(3) // drop node, script, command
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === undefined) continue
    if (a === '--strict') continue
    if (a === '--config') {
      i++ // skip its value
      continue
    }
    if (a.startsWith('--')) continue
    out.push(a)
  }
  return out
}

async function loadConfig(): Promise<AtlasConfig | null> {
  const configPath = resolve(flagValue('--config') ?? 'atlas.config.mjs')
  if (!existsSync(configPath)) {
    console.error(`atlas: no config at ${configPath}`)
    return null
  }
  const mod: { default?: AtlasConfig; config?: AtlasConfig } = await import(
    pathToFileURL(configPath).href
  )
  const config = mod.default ?? mod.config
  if (!config?.graph?.files || typeof config.graph.files !== 'object') {
    console.error('atlas: config must export default { graph: { files: {...} } }')
    return null
  }
  return config
}

function usage(): number {
  console.error(
    'usage: sys-atlas <affected|validate|propagation> [--config atlas.config.mjs] [--strict] [args...]',
  )
  return 1
}

async function main(): Promise<number> {
  const strict = process.argv.includes('--strict')
  const command = process.argv[2]
  if (!command || command.startsWith('--')) return usage()

  const config = await loadConfig()
  if (!config) return strict ? 1 : 0
  const { graph } = config

  switch (command) {
    case 'affected': {
      const inputs = positionals()
      if (inputs.length === 0) {
        console.error('atlas affected: provide at least one file or concept')
        return strict ? 1 : 0
      }
      const items = affected(graph, inputs, { exempt: config.exempt })
      if (items.length === 0) {
        console.log('atlas: no affected files')
        return 0
      }
      for (const it of items) console.log(`${it.criticality.padEnd(8)} ${it.file}  (${it.reason})`)
      console.log(`\natlas: ${items.length} affected file(s)`)
      return 0
    }
    case 'validate': {
      const errors = validateGraph(graph)
      const orphans = orphanConsumedConcepts(graph)
      if (errors.length === 0) {
        console.log(
          `atlas: graph ok (${Object.keys(graph.files).length} files${orphans.length ? `, ${orphans.length} orphan concept(s)` : ''})`,
        )
        if (orphans.length) console.error(`atlas: orphan consumed concepts: ${orphans.join(', ')}`)
        return 0
      }
      console.error(`atlas: ${errors.length} graph error(s):\n  ${errors.join('\n  ')}`)
      return strict ? 1 : 0
    }
    case 'propagation': {
      const changed = positionals()
      if (changed.length === 0) {
        console.error('atlas propagation: provide the changed files')
        return strict ? 1 : 0
      }
      const gaps = propagationGaps(graph, changed, { exempt: config.exempt })
      if (gaps.length === 0) {
        console.log('atlas: propagation complete (no gaps)')
        return 0
      }
      for (const g of gaps) console.error(`${g.source} → missing: ${g.missingTargets.join(', ')}`)
      console.error(`\natlas: ${gaps.length} propagation gap(s)`)
      return strict ? 1 : 0
    }
    default:
      return usage()
  }
}

main().then((code) => process.exit(code))
