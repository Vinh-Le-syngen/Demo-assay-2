// Drift gate for the DERIVED coverage map. taxonomy.yaml is the single source of truth: each
// packages/* entity declares `test_profile`, and assay.config.json `coverage.areaProfiles` is
// generated from it (scripts/gen-assay-areas.mjs). This check re-derives the map in memory and
// fails if the committed config has drifted — i.e. someone hand-edited areaProfiles, or added a
// package / changed a test_profile in taxonomy.yaml without re-running the generator. That closes
// the hole where a new sys with zero tests would slip past assay's coverage matrix: it cannot land
// without a taxonomy entry (check-taxonomy.mjs) carrying a test_profile that lands here. Run in CI.
//
// BLOCK (exit 1): coverage gate off; committed areaProfiles != derived-from-taxonomy.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deriveAreaProfiles, deriveOverrides } from './gen-assay-areas.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const errors = []

let cfg
try {
  cfg = JSON.parse(readFileSync(join(root, 'assay.config.json'), 'utf8'))
} catch (e) {
  console.error(`assay.config.json does not parse: ${e.message}`)
  process.exit(1)
}

// Enrolment is meaningless unless the coverage gate is actually on (warnOnly is fine while phasing in).
if (cfg?.gates?.coverage !== true) {
  console.error('assay coverage gate is off (gates.coverage !== true) — coverage floors are inert. Enable it.')
  process.exit(1)
}

let derived
try {
  derived = deriveAreaProfiles(root)
} catch (e) {
  console.error(`cannot derive areaProfiles from taxonomy.yaml: ${e.message}`)
  process.exit(1)
}

const committed = cfg?.coverage?.areaProfiles ?? {}
const areas = new Set([...Object.keys(derived), ...Object.keys(committed)])
for (const area of [...areas].sort()) {
  const want = derived[area]
  const have = committed[area]
  if (want == null) errors.push(`area "${area}" is in assay.config.json but not in taxonomy.yaml — remove it or add the package entity`)
  else if (have == null) errors.push(`package "${area}" (taxonomy test_profile: ${want}) is not enrolled in assay.config.json coverage.areaProfiles`)
  else if (have !== want) errors.push(`area "${area}": assay.config.json has "${have}" but taxonomy.yaml test_profile is "${want}"`)
}

// Overrides are also derived from taxonomy.yaml (per-entity test_overrides) — drift-check them too.
let derivedOv
try {
  derivedOv = deriveOverrides(root)
} catch (e) {
  console.error(`cannot derive overrides from taxonomy.yaml: ${e.message}`)
  process.exit(1)
}
const committedOv = cfg?.coverage?.overrides ?? {}
if (JSON.stringify(committedOv) !== JSON.stringify(derivedOv))
  errors.push('coverage.overrides drifted from taxonomy.yaml test_overrides')

if (errors.length) {
  for (const m of errors) console.error(`  ✗ ${m}`)
  console.error(`\nassay-areas: coverage map drifted from taxonomy.yaml (${errors.length} issue(s)). Run \`pnpm gen:assay-areas\`.`)
  process.exit(1)
}
console.log(`assay-areas ok: ${Object.keys(derived).length} package(s) enrolled, coverage map matches taxonomy.yaml`)
