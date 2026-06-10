// Generate assay.config.json `coverage.areaProfiles` FROM taxonomy.yaml — the single source of
// truth. Each packages/* entity declares `test_profile`; this projects that into the per-area
// coverage map assay reads. areaProfiles is therefore a DERIVED artifact (committed for assay's
// pure config loader); never hand-edit it — edit `test_profile` in taxonomy.yaml and re-run this.
// `pnpm gen:assay-areas`. check-assay-areas.mjs fails CI if the committed map drifts from this.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = fileURLToPath(new URL('..', import.meta.url))

function packageEntities(root) {
  const tax = parse(readFileSync(join(root, 'taxonomy.yaml'), 'utf8'))
  const validProfiles = new Set(tax.test_profiles ?? [])
  const entities = []
  for (const e of tax.entities ?? []) {
    const path = String(e?.path ?? '')
    if (!path.startsWith('packages/')) continue
    const area = path.slice('packages/'.length).split('/')[0]
    if (!e?.test_profile) throw new Error(`taxonomy entity "${e?.id ?? path}" missing test_profile`)
    if (!validProfiles.has(e.test_profile)) throw new Error(`taxonomy entity "${e?.id ?? path}" invalid test_profile "${e.test_profile}"`)
    entities.push({ id: e.id, area, test_profile: e.test_profile, test_overrides: e.test_overrides ?? null })
  }
  return entities
}

/** Derive the area→profile map from taxonomy.yaml's package entities. Exported for the drift check. */
export function deriveAreaProfiles(root) {
  const map = {}
  for (const e of packageEntities(root)) map[e.area] = e.test_profile
  // Deterministic key order so the committed artifact is stable across runs.
  return Object.fromEntries(Object.keys(map).sort().map((k) => [k, map[k]]))
}

/**
 * Derive the per-area coverage overrides from each entity's optional `test_overrides`
 * (category → { required?, min?, reason }). A justified exception to the profile floor — a
 * category that genuinely doesn't apply to the package — lives in taxonomy.yaml, not by hand
 * in assay.config.json. assay's own schema enforces a substantive `reason` (>=12 chars).
 */
export function deriveOverrides(root) {
  const out = {}
  for (const e of packageEntities(root)) {
    if (!e.test_overrides || Object.keys(e.test_overrides).length === 0) continue
    const byCat = {}
    for (const cat of Object.keys(e.test_overrides).sort()) byCat[cat] = e.test_overrides[cat]
    out[e.area] = byCat
  }
  return Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]))
}

if (process.argv[1] && process.argv[1].endsWith('gen-assay-areas.mjs')) {
  const cfgPath = join(root, 'assay.config.json')
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))
  cfg.coverage = cfg.coverage ?? {}
  cfg.coverage.areaProfiles = deriveAreaProfiles(root)
  cfg.coverage.overrides = deriveOverrides(root)
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n')
  const nOv = Object.keys(cfg.coverage.overrides).length
  console.log(`gen:assay-areas — wrote ${Object.keys(cfg.coverage.areaProfiles).length} areaProfiles + overrides for ${nOv} area(s) from taxonomy.yaml`)
}
