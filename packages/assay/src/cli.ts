#!/usr/bin/env node
// @sys/assay CLI — the cross-language entry. Any runtime (incl. cadre-os's bash) invokes
// `sys-assay [--strict] [--config <path>] [--report] [--json]`. Reads a JSON config, audits,
// reports, exits non-zero under --strict when a fatal gate is breached.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { defineAssay, manifestSchema, GATE_NAMES, type GateName } from './config'
import { audit, isFatal, coverageMatrix, discoverTests, type AssayFinding } from './engine'
import { TAXONOMY } from './taxonomy'
import { nodeHost } from './node-host'

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

/** Render a thrown error (Zod or otherwise) as readable lines, never a stack trace. */
function fmtErr(e: unknown): string {
  const issues = (e as { issues?: { path: (string | number)[]; message: string }[] })?.issues
  if (Array.isArray(issues)) {
    return issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')
  }
  return `  ${(e as Error)?.message ?? String(e)}`
}

const GATE_LABEL: Record<GateName, string> = {
  noUntracked: 'UNTRACKED test files (register them)',
  noStale: 'STALE manifest entries (file gone)',
  requireTriggerForHighRisk: 'high-risk tests with no trigger',
  noShells: 'SHELL tests (no real assertions / not running)',
  validClassification: 'CLASSIFICATION (taxonomy)',
  authorSeparation: 'AUTHOR-SEPARATION',
  coverage: 'COVERAGE gaps',
}

function printGroup(title: string, fs: AssayFinding[]): void {
  if (!fs.length) return
  const lines = fs.map((f) => `  ${f.path ?? f.area ?? ''} — ${f.message}`).join('\n')
  console.error(`\nassay: ${title}:\n${lines}`)
}

function main(): number {
  const strict = process.argv.includes('--strict')
  const report = process.argv.includes('--report')
  const asJson = process.argv.includes('--json')
  const configPath = resolve(arg('--config') ?? 'assay.config.json')
  if (!existsSync(configPath)) {
    console.error(`assay: no config at ${configPath}`)
    return strict ? 1 : 0
  }
  // The project root is the config file's directory; paths in config are relative to it.
  const root = dirname(configPath)
  let config: ReturnType<typeof defineAssay>
  try {
    config = defineAssay(JSON.parse(readFileSync(configPath, 'utf8')))
  } catch (e) {
    console.error(`assay: invalid config (${configPath}):\n${fmtErr(e)}`)
    return 1
  }
  const host = nodeHost(root)

  const manifestRaw = host.readFile(config.manifestPath)
  if (manifestRaw == null) {
    console.error(`assay: manifest not found: ${config.manifestPath}`)
    return strict ? 1 : 0
  }
  let manifest: ReturnType<typeof manifestSchema.parse>
  try {
    manifest = manifestSchema.parse(JSON.parse(manifestRaw))
  } catch (e) {
    console.error(`assay: invalid manifest (${config.manifestPath}):\n${fmtErr(e)}`)
    return 1
  }
  const r = audit(config, manifest, host)

  // --report: emit the coverage matrix (declared/present/need), stamped with taxonomy lineage.
  if (report) {
    const onDisk = new Set(discoverTests(config, host))
    const rows = coverageMatrix(config, manifest, onDisk)
    if (asJson) {
      console.log(JSON.stringify({ taxonomy: { schema_version: TAXONOMY.schema_version, provenance: TAXONOMY.provenance }, rows }, null, 2))
    } else {
      console.log(`assay coverage report (taxonomy v${TAXONOMY.schema_version}, profile: ${config.coverage.profile})`)
      console.log('  area                 category       have/need  declared  status')
      for (const row of rows) {
        const status = !row.required ? 'waived' : row.met ? 'ok' : 'GAP'
        console.log(`  ${row.area.padEnd(20)} ${row.category.padEnd(14)} ${String(row.present).padStart(4)}/${String(row.need).padEnd(4)} ${String(row.declared).padStart(8)}  ${status}`)
      }
    }
    return strict && isFatal(r) ? 1 : 0
  }

  if (asJson) {
    console.log(JSON.stringify({ ...r, fatal: isFatal(r) }, null, 2))
    return strict && isFatal(r) ? 1 : 0
  }

  if (r.findings.length === 0) {
    console.log(`assay: ok (${r.total} registered, ${r.onDisk} on disk)`)
    return 0
  }

  const fatal = r.findings.filter((f) => f.severity === 'fatal')
  const warn = r.findings.filter((f) => f.severity === 'warn')
  for (const gate of GATE_NAMES) {
    printGroup(GATE_LABEL[gate], fatal.filter((f) => f.gate === gate))
  }
  for (const gate of GATE_NAMES) {
    const ws = warn.filter((f) => f.gate === gate)
    if (ws.length) printGroup(`WARN — ${GATE_LABEL[gate]}`, ws)
  }
  if (fatal.length === 0) console.error(`\nassay: ${r.total} registered, ${r.onDisk} on disk — warnings only`)
  else console.error('')

  return strict && isFatal(r) ? 1 : 0
}

process.exit(main())
