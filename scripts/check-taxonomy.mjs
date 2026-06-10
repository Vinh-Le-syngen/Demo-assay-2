// Package-catalog gate for taxonomy.yaml. Taxonomy is hand-authored (it encodes architectural
// judgment + provenance); this script makes it impossible to land stale. Run in CI.
//
// taxonomy.yaml is the "package catalog canon" (the @sys/canon pattern applied to the repo's own
// packages): a registry of truth + provenance + gates with a severity policy.
//
// BLOCK (exit 1): file parses; strict shape; required fields; kind ∈ entity_kinds;
//   planes ∈ planes; no duplicate ids/paths; every entity/module path exists; every packages/*
//   classified or ignored; complete provenance (owner/last_reviewed/status, status ∈ statuses,
//   valid date); README.md present.
// WARN (exit 0, printed): CHANGELOG.md missing; version is 0.0.0 (unreleased placeholder);
//   owner still "unassigned"; last_reviewed older than STALE_DAYS.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = fileURLToPath(new URL('..', import.meta.url))
const STALE_DAYS = 180
const errors = []
const warnings = []
const fail = (msg) => errors.push(msg)
const warn = (msg) => warnings.push(msg)

let tax
try {
  tax = parse(readFileSync(join(root, 'taxonomy.yaml'), 'utf8'))
} catch (e) {
  console.error(`taxonomy.yaml does not parse: ${e.message}`)
  process.exit(1)
}

const planes = new Set(tax.planes ?? [])
const businessPlanes = new Set(tax.business_planes ?? [])
const kinds = new Set(tax.entity_kinds ?? [])
const statuses = new Set(tax.statuses ?? [])
const testProfiles = new Set(tax.test_profiles ?? [])
const ignore = new Set(tax.ignore ?? [])
if (testProfiles.size === 0) fail('test_profiles[] is empty or missing')
if (planes.size === 0) fail('planes[] is empty or missing')
if (kinds.size === 0) fail('entity_kinds[] is empty or missing')
if (statuses.size === 0) fail('statuses[] is empty or missing')
if (!Array.isArray(tax.entities)) fail('entities[] is missing')

const seenIds = new Set()
const seenPaths = new Set()
const classifiedPaths = new Set()

for (const e of tax.entities ?? []) {
  const where = e?.id ?? e?.path ?? JSON.stringify(e)
  for (const field of ['id', 'kind', 'path', 'primary_plane', 'purpose']) {
    if (!e?.[field]) fail(`entity "${where}": missing required field "${field}"`)
  }
  if (e?.kind && !kinds.has(e.kind)) fail(`entity "${where}": unknown kind "${e.kind}"`)
  if (e?.primary_plane && !planes.has(e.primary_plane))
    fail(`entity "${where}": invalid primary_plane "${e.primary_plane}"`)
  for (const sp of e?.secondary_planes ?? [])
    if (!planes.has(sp)) fail(`entity "${where}": invalid secondary_plane "${sp}"`)
  // Business plane is the optional second axis (consumer-owned); validated only when declared.
  for (const bp of e?.business_planes ?? [])
    if (!businessPlanes.has(bp)) fail(`entity "${where}": invalid business_plane "${bp}"`)

  if (e?.id) {
    if (seenIds.has(e.id)) fail(`duplicate id "${e.id}"`)
    seenIds.add(e.id)
  }
  if (e?.path) {
    if (seenPaths.has(e.path)) fail(`duplicate path "${e.path}"`)
    seenPaths.add(e.path)
    classifiedPaths.add(e.path)
    if (!existsSync(join(root, e.path))) fail(`entity "${where}": path does not exist: ${e.path}`)
  }
  for (const m of e?.modules ?? []) {
    if (!m?.plane || !planes.has(m.plane))
      fail(`entity "${where}" module "${m?.path}": invalid plane "${m?.plane}"`)
    if (m?.path && e?.path && !existsSync(join(root, e.path, m.path)))
      fail(`entity "${where}": module path does not exist: ${join(e.path, m.path)}`)
  }

  // Provenance + hygiene apply to package entities (those under packages/).
  if (typeof e?.path === 'string' && e.path.startsWith('packages/')) {
    // Provenance fields must be present (BLOCK).
    for (const field of ['owner', 'last_reviewed', 'status']) {
      if (e?.[field] == null) fail(`entity "${where}": missing provenance field "${field}"`)
    }
    if (e?.status != null && !statuses.has(e.status))
      fail(`entity "${where}": invalid status "${e.status}" (allowed: ${[...statuses].join(', ')})`)
    // Test posture (SoT for the assay coverage floor; areaProfiles is generated from it).
    if (e?.test_profile == null) fail(`entity "${where}": missing test_profile (allowed: ${[...testProfiles].join(', ')})`)
    else if (!testProfiles.has(e.test_profile))
      fail(`entity "${where}": invalid test_profile "${e.test_profile}" (allowed: ${[...testProfiles].join(', ')})`)
    // Optional per-category floor exceptions. Category names are validated by assay's config schema
    // on load; here we enforce a substantive reason so an exception is always justified.
    if (e?.test_overrides != null) {
      if (typeof e.test_overrides !== 'object' || Array.isArray(e.test_overrides))
        fail(`entity "${where}": test_overrides must be a category→{required?,min?,reason} map`)
      else
        for (const [cat, ov] of Object.entries(e.test_overrides)) {
          if (ov == null || typeof ov !== 'object') fail(`entity "${where}": test_overrides.${cat} must be an object`)
          else if (typeof ov.reason !== 'string' || ov.reason.trim().length < 12)
            fail(`entity "${where}": test_overrides.${cat} needs a substantive reason (>=12 chars)`)
        }
    }
    let reviewedAt = null
    if (e?.last_reviewed != null) {
      reviewedAt = new Date(e.last_reviewed)
      if (Number.isNaN(reviewedAt.getTime()))
        fail(`entity "${where}": last_reviewed "${e.last_reviewed}" is not a valid date`)
    }

    // README is load-bearing (BLOCK); the rest nudge (WARN).
    if (!existsSync(join(root, e.path, 'README.md'))) fail(`entity "${where}": missing README.md`)
    if (!existsSync(join(root, e.path, 'CHANGELOG.md'))) warn(`entity "${where}": no CHANGELOG.md`)
    if (String(e?.owner ?? '').toLowerCase() === 'unassigned')
      warn(`entity "${where}": owner still "unassigned" — assign a team/role`)
    if (reviewedAt && !Number.isNaN(reviewedAt.getTime())) {
      const ageDays = (Date.now() - reviewedAt.getTime()) / 86_400_000
      if (ageDays > STALE_DAYS)
        warn(`entity "${where}": last_reviewed ${e.last_reviewed} is ${Math.round(ageDays)}d old (> ${STALE_DAYS})`)
    }
    const pkgJsonPath = join(root, e.path, 'package.json')
    if (existsSync(pkgJsonPath)) {
      try {
        const v = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).version
        if (v === '0.0.0') warn(`entity "${where}": version 0.0.0 (unreleased placeholder) — bump to publish`)
      } catch {
        fail(`entity "${where}": package.json does not parse`)
      }
    }
  }
}

// Repo drift: every packages/* must be classified or explicitly ignored.
const pkgDir = join(root, 'packages')
if (existsSync(pkgDir)) {
  for (const name of readdirSync(pkgDir)) {
    const rel = `packages/${name}`
    if (!statSync(join(root, rel)).isDirectory()) continue
    if (!classifiedPaths.has(rel) && !ignore.has(rel))
      fail(`unclassified package "${rel}" — add it to taxonomy.yaml entities (or ignore[])`)
  }
}

if (warnings.length > 0) {
  for (const m of warnings) console.warn(`  ⚠ ${m}`)
  console.warn(`\ntaxonomy: ${warnings.length} warning(s) (non-blocking).`)
}
if (errors.length > 0) {
  for (const m of errors) console.error(`  ✗ ${m}`)
  console.error(`\ntaxonomy drift: ${errors.length} error(s). Update taxonomy.yaml.`)
  process.exit(1)
}
console.log(
  `taxonomy ok: ${tax.entities.length} entit${tax.entities.length === 1 ? 'y' : 'ies'} classified across ${tax.planes.length} planes` +
    (warnings.length ? ` (${warnings.length} warning(s))` : ''),
)
