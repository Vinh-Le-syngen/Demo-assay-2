#!/usr/bin/env node
// @eng/governance CLI (bin: sys-canon) — thin IO shell. Validates @sys/canon records; runs the deciders.
// Cross-language entry: cadre-os (Python/bash) shells out; Qarar (TS) imports the engine directly.
//
//   sys-canon scan     --registry <restricted-claims.yaml> --paths <dir|file>... [--exclude <regex>]
//   sys-canon validate --schema <name> --file <yaml>
//   sys-canon link     --claims <approved-claims.yaml> --capabilities <capability-inventory.yaml>
// Exit codes: 0 ok · 1 violations/invalid · 2 usage/IO error.

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import YAML from 'yaml'
import {
  RestrictedClaimsConfig,
  ApprovedClaimsConfig,
  CapabilityInventoryConfig,
  validate,
  schemas,
  type SchemaName,
} from '@sys/canon'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { validateSeo, seoSchemas, type SeoSchemaName } from '@sys/canon'
import { toJsonSchema, allJsonSchemas, allSchemaNames, type AnySchemaName } from '@sys/canon'
import { scanClaims, linkClaims, type ContentFile } from './decide'
import { SCAFFOLD } from './templates'

function flagValues(flag: string): string[] {
  const out: string[] = []
  const argv = process.argv
  const i = argv.indexOf(flag)
  if (i < 0) return out
  for (let j = i + 1; j < argv.length && !argv[j]!.startsWith('--'); j++) out.push(argv[j]!)
  return out
}
const flagValue = (flag: string): string | undefined => flagValues(flag)[0]
const readYaml = (p: string): unknown => YAML.parse(readFileSync(resolve(p), 'utf8'))

const TEXT_EXT = /\.(html?|css|js|jsx|ts|tsx|md|mdx|txt|json|ya?ml)$/i
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|\.next|coverage)(\/|$)/

function walk(target: string, acc: ContentFile[]): void {
  let st
  try {
    st = statSync(target)
  } catch {
    return
  }
  if (st.isDirectory()) {
    if (SKIP_DIR.test(target)) return
    for (const e of readdirSync(target)) walk(join(target, e), acc)
  } else if (st.isFile() && TEXT_EXT.test(target)) {
    try {
      acc.push({ path: target, text: readFileSync(target, 'utf8') })
    } catch {
      /* skip */
    }
  }
}

function cmdScan(): number {
  const registry = flagValue('--registry')
  const paths = flagValues('--paths')
  if (!registry || paths.length === 0) {
    console.error('usage: sys-canon scan --registry <restricted-claims.yaml> --paths <dir>...')
    return 2
  }
  let restricted
  try {
    restricted = RestrictedClaimsConfig.parse(readYaml(registry)).restricted
  } catch (e) {
    console.error(`sys-canon: cannot read/parse registry ${registry}: ${(e as Error).message}`)
    return 2
  }
  const excludeFlag = flagValue('--exclude')
  const files: ContentFile[] = []
  for (const p of paths) walk(resolve(p), files)
  const violations = scanClaims(files, restricted, excludeFlag ? { exclude: new RegExp(excludeFlag) } : {})
  for (const v of violations) console.log(`RESTRICTED [${v.severity}] "${v.phrase}"  →  ${v.path}:${v.line}`)
  console.log('----------------------------------------')
  if (violations.length > 0) {
    console.log(`FAIL: ${violations.length} restricted-claim occurrence(s).`)
    return 1
  }
  console.log('OK: no restricted claims found.')
  return 0
}

function cmdValidate(): number {
  const schema = flagValue('--schema')
  const file = flagValue('--file')
  if (!schema || !file) {
    console.error('usage: sys-canon validate --schema <name> --file <yaml>')
    return 2
  }
  let obj
  try {
    obj = readYaml(file)
  } catch (e) {
    console.error(`sys-canon: cannot read/parse ${file}: ${(e as Error).message}`)
    return 2
  }
  const result = schema in schemas ? validate(schema as SchemaName, obj) : schema in seoSchemas ? validateSeo(schema as SeoSchemaName, obj) : undefined
  if (!result) {
    console.error(`sys-canon: unknown schema '${schema}'. Known: ${[...Object.keys(schemas), ...Object.keys(seoSchemas)].join(', ')}`)
    return 2
  }
  if (!result.success) {
    console.error(`INVALID ${file} against '${schema}':`)
    for (const issue of result.error.issues) console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    return 1
  }
  console.log(`OK: ${file} valid against '${schema}'.`)
  return 0
}

function cmdLink(): number {
  const claimsFile = flagValue('--claims')
  const capsFile = flagValue('--capabilities')
  if (!claimsFile || !capsFile) {
    console.error('usage: sys-canon link --claims <approved-claims.yaml> --capabilities <capability-inventory.yaml>')
    return 2
  }
  let claims, caps
  try {
    claims = ApprovedClaimsConfig.parse(readYaml(claimsFile)).claims
    caps = CapabilityInventoryConfig.parse(readYaml(capsFile)).capabilities
  } catch (e) {
    console.error(`sys-canon: cannot read/parse inputs: ${(e as Error).message}`)
    return 2
  }
  const issues = linkClaims(claims, caps)
  for (const i of issues) console.log(`CLAIM [${i.severity}] ${i.claim_id} → ${i.kind}: ${i.capability}`)
  console.log('----------------------------------------')
  if (issues.length > 0) {
    console.log(`FAIL: ${issues.length} claim→capability issue(s).`)
    return 1
  }
  console.log('OK: every approved claim maps to a live/assisted capability.')
  return 0
}

function cmdSchema(): number {
  const name = flagValue('--name') as AnySchemaName | undefined
  const out = flagValue('--out')
  if (name && !allSchemaNames.includes(name)) {
    console.error(`sys-canon: unknown schema '${name}'. Known: ${allSchemaNames.join(', ')}`)
    return 2
  }
  if (out) {
    mkdirSync(resolve(out), { recursive: true })
    const names = name ? [name] : allSchemaNames
    for (const n of names) writeFileSync(join(resolve(out), `${n}.schema.json`), JSON.stringify(toJsonSchema(n), null, 2) + '\n')
    console.log(`OK: wrote ${names.length} JSON Schema file(s) to ${out}`)
    return 0
  }
  console.log(JSON.stringify(name ? toJsonSchema(name) : allJsonSchemas(), null, 2))
  return 0
}

function cmdInit(): number {
  const out = flagValue('--out') ?? 'docs/governance'
  const force = process.argv.includes('--force')
  const root = resolve(out)
  let written = 0
  let skipped = 0
  for (const [rel, content] of Object.entries(SCAFFOLD)) {
    const dest = join(root, rel)
    if (existsSync(dest) && !force) {
      skipped++
      continue
    }
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, content)
    written++
  }
  console.log(`OK: governance spine scaffolded at ${out} (${written} written, ${skipped} skipped${skipped ? '; --force to overwrite' : ''}).`)
  console.log('Next: fill the [VERIFY] cells, then `sys-canon validate` / `scan` / `link`.')
  return 0
}

function main(): number {
  switch (process.argv[2]) {
    case 'init':
      return cmdInit()
    case 'scan':
      return cmdScan()
    case 'validate':
      return cmdValidate()
    case 'link':
      return cmdLink()
    case 'schema':
      return cmdSchema()
    default:
      console.error('usage: sys-canon <init|scan|validate|link|schema> [options]')
      return 2
  }
}

process.exit(main())
