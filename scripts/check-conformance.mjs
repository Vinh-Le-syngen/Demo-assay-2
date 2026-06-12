// scripts/check-conformance.mjs
// Conformance checker + matrix generator for the @sys/* / @eng/* Package Development Standard.
//
// Checks R2 (Zod composition root), R7 (documentation), R8 (cross-runtime CLI + schema).
// R1, R3, R4, R5, R6 are enforced by pnpm check — always PASS, columns omitted from the matrix.
//
// Scoring model:
//   PASS  — requirement fully met
//   FAIL  — normative MUST not met
//   INFO  — SHOULD not met (non-blocking guidance)
//   N/A   — conditional rule does not apply to this package
//
// Usage:
//   node scripts/check-conformance.mjs           # report-only, always exits 0
//   node scripts/check-conformance.mjs --strict  # exit 1 on any FAIL
//
// Output: docs/conformance_matrix.md  +  console summary

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = fileURLToPath(new URL('..', import.meta.url))
const strict = process.argv.includes('--strict')

// ── file walker ───────────────────────────────────────────────────────────────

function walkTs(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    try {
      if (statSync(full).isDirectory()) out.push(...walkTs(full))
      else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.d.ts')) out.push(full)
    } catch { /* skip unreadable */ }
  }
  return out
}

// ── load shared data ──────────────────────────────────────────────────────────

const tax = parse(readFileSync(join(root, 'taxonomy.yaml'), 'utf8'))
const rootReadme = readFileSync(join(root, 'README.md'), 'utf8')

// ── rule checkers ─────────────────────────────────────────────────────────────

// R2: single define<Pascal>() export + Zod import somewhere in src/ (excluding tests)
function checkR2(pkgPath) {
  const srcDir = join(root, pkgPath, 'src')
  if (!existsSync(srcDir)) return { status: 'FAIL', detail: 'no src/ directory' }

  const files = walkTs(srcDir).filter(
    f => !f.includes('__tests__') && !f.includes('__test__') && !f.includes('.test.')
  )

  let defineCount = 0
  let hasZod = false

  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    defineCount += (src.match(/export\s+(?:function|const)\s+define[A-Z]\w*/g) ?? []).length
    if (/from\s+['"]zod['"]/.test(src)) hasZod = true
  }

  if (defineCount >= 1 && hasZod) return { status: 'PASS', detail: `${defineCount} defineX + Zod` }
  if (defineCount >= 1) return { status: 'FAIL', detail: 'defineX present but no Zod validation' }
  return { status: 'FAIL', detail: 'missing defineX composition root' + (hasZod ? '' : ' (and Zod)') }
}

// R7: README.md (MUST) + root-table row (MUST) + docs/ dir (SHOULD → INFO)
function checkR7(pkgPath, npmName) {
  if (!existsSync(join(root, pkgPath, 'README.md')))
    return { status: 'FAIL', detail: 'missing README.md' }

  const inTable = rootReadme.includes(`\`${npmName}\``) || rootReadme.includes(`[${npmName}]`)
  if (!inTable) return { status: 'FAIL', detail: 'not listed in root README.md table' }

  if (!existsSync(join(root, pkgPath, 'docs')))
    return { status: 'INFO', detail: 'SHOULD: no docs/ directory' }

  return { status: 'PASS' }
}

// R8: if cross_runtime: true → needs bin (CLI) + schema file/script; otherwise N/A
function checkR8(pkgPath, crossRuntime) {
  if (!crossRuntime) return { status: 'N/A', detail: 'TS-only package' }

  const pkgJson = JSON.parse(readFileSync(join(root, pkgPath, 'package.json'), 'utf8'))
  const hasBin = !!(pkgJson.bin && Object.keys(pkgJson.bin).length > 0)
  const hasSchema =
    existsSync(join(root, pkgPath, 'schema')) ||
    existsSync(join(root, pkgPath, 'scripts', 'emit-schema.mjs'))

  if (hasBin && hasSchema) return { status: 'PASS' }
  if (hasBin) return { status: 'FAIL', detail: 'CLI present — add scripts/emit-schema.mjs' }
  if (hasSchema) return { status: 'FAIL', detail: 'schema present but no bin/CLI entry' }
  return { status: 'FAIL', detail: 'no CLI or schema' }
}

// ── run all packages ──────────────────────────────────────────────────────────

const results = []
let failCount = 0

for (const e of tax.entities ?? []) {
  if (e.kind !== 'package' || typeof e.path !== 'string' || !e.path.startsWith('packages/')) continue

  const r2 = checkR2(e.path)
  const r7 = checkR7(e.path, e.npm ?? e.id)
  const r8 = checkR8(e.path, e.cross_runtime === true)

  if ([r2, r7, r8].some(c => c.status === 'FAIL')) failCount++
  results.push({ npm: e.npm ?? e.id, path: e.path, r2, r7, r8 })
}

// ── emit markdown matrix ──────────────────────────────────────────────────────

const ICON = { PASS: '✅', FAIL: '❌', INFO: 'ℹ️', 'N/A': '—' }
const icon = c => ICON[c.status] ?? '?'
const today = new Date().toISOString().slice(0, 10)

const md = [
  '# `@sys/*` / `@eng/*` Conformance Matrix',
  '',
  `> Generated ${today} — \`node scripts/check-conformance.mjs\` to refresh.`,
  '',
  '**Legend:** ✅ PASS · ❌ FAIL (MUST unmet) · ℹ️ INFO (SHOULD unmet, non-blocking) · — N/A',
  '',
  '> **R1, R3, R4, R5, R6** are machine-enforced by `pnpm check` (boundaries · taxonomy · build · typecheck · tests · assay). All packages pass — columns omitted.',
  '> **R2** MUST: single `define<Pascal>()` export + Zod validation in `src/`.',
  '> **R7** MUST: `README.md` + row in root `README.md` table. SHOULD: `docs/` directory (INFO if absent).',
  '> **R8** applies only when `cross_runtime: true` in `taxonomy.yaml`; all others are N/A.',
  '',
  '| Package | R2: Zod Root | R7: Docs | R8: Cross-Runtime |',
  '|---------|:---:|:---:|:---:|',
  ...results.map(r => `| \`${r.npm}\` | ${icon(r.r2)} | ${icon(r.r7)} | ${icon(r.r8)} |`),
  '',
  '---',
  '',
  '## FAIL Details',
  '',
]

const fails = results.filter(r => [r.r2, r.r7, r.r8].some(c => c.status === 'FAIL'))
if (fails.length === 0) {
  md.push('*No failures — all normative MUST requirements met.*')
} else {
  for (const r of fails) {
    md.push(`**\`${r.npm}\`**`)
    if (r.r2.status === 'FAIL') md.push(`- R2: ${r.r2.detail}`)
    if (r.r7.status === 'FAIL') md.push(`- R7: ${r.r7.detail}`)
    if (r.r8.status === 'FAIL') md.push(`- R8: ${r.r8.detail}`)
    md.push('')
  }
}

md.push('## INFO Items (unmet SHOULDs — non-blocking)')
md.push('')

const infos = results.filter(r => [r.r2, r.r7, r.r8].some(c => c.status === 'INFO'))
if (infos.length === 0) {
  md.push('*No INFO items.*')
} else {
  for (const r of infos) {
    md.push(`**\`${r.npm}\`**`)
    if (r.r2.status === 'INFO') md.push(`- R2: ${r.r2.detail}`)
    if (r.r7.status === 'INFO') md.push(`- R7: ${r.r7.detail}`)
    if (r.r8.status === 'INFO') md.push(`- R8: ${r.r8.detail}`)
    md.push('')
  }
}

writeFileSync(join(root, 'docs', 'conformance_matrix.md'), md.join('\n') + '\n')

// ── console summary ───────────────────────────────────────────────────────────

const r8app = results.filter(r => r.r8.status !== 'N/A')

console.log(`
conformance: ${results.length} packages checked
  R2  ${results.filter(r => r.r2.status === 'PASS').length} PASS  ${results.filter(r => r.r2.status === 'FAIL').length} FAIL
  R7  ${results.filter(r => r.r7.status === 'PASS').length} PASS  ${results.filter(r => r.r7.status === 'FAIL').length} FAIL  ${results.filter(r => r.r7.status === 'INFO').length} INFO
  R8  ${r8app.filter(r => r.r8.status === 'PASS').length}/${r8app.length} PASS (cross-runtime)  ${r8app.filter(r => r.r8.status === 'FAIL').length} FAIL

  → docs/conformance_matrix.md`)

if (failCount > 0) {
  if (strict) {
    console.error(`\nconformance: FAIL — ${failCount} package(s) with unmet MUST requirements (--strict)`)
    process.exit(1)
  }
  console.log(`  ${failCount} package(s) have FAIL items  (add --strict to gate CI after Phase 3 remediation)`)
}
