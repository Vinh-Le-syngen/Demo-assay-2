// @sys/assay engine — pure, testable. The filesystem is an injected seam (AssayHost),
// so the audit logic is exercised with an in-memory host (no temp dirs). Owns the
// Governance concern: every test is registered, classified into the canonical taxonomy,
// authored by the right role, plane-disciplined, no shells, and meets coverage floors.
//
// Every gate emits a uniform AssayFinding tagged with its `gate`, collected into one
// `report.findings` list. That uniformity makes `warnOnly` a single demotion pass and `isFatal`
// a single predicate — no per-gate special-casing.

import type { AssayConfig, GateName, TestManifest } from './config'
import {
  type Category,
  categorySpec,
  isCategory,
  isGovernanceSensitive,
  profileSpec,
} from './taxonomy'

/** Filesystem seam — a host (node, or any runtime) provides file access. */
export interface AssayHost {
  /** File paths (relative to root) under the given roots, excluding node_modules. */
  listFiles(roots: string[]): string[]
  /** File contents by relative path, or null if missing. */
  readFile(relPath: string): string | null
}

/** Uniform finding shape for every gate. `gate` is the producing gate; `severity` may be demoted by warnOnly. */
export type AssayFinding = {
  gate: GateName
  code: string
  message: string
  severity: 'warn' | 'fatal'
  path?: string
  area?: string
  category?: string
  details?: Record<string, unknown>
}

export type AuditReport = {
  findings: AssayFinding[]
  total: number // registered count
  onDisk: number // discovered count
}

export function discoverTests(config: AssayConfig, host: AssayHost): string[] {
  const re = new RegExp(config.testPattern)
  return host
    .listFiles(config.testRoots)
    .filter((p) => re.test(p))
    .sort()
}

/** Findings for the registry gates (untracked / stale / high-risk-without-trigger). */
function detectRegistry(config: AssayConfig, manifest: TestManifest, onDisk: Set<string>): AssayFinding[] {
  const findings: AssayFinding[] = []
  const registered = new Set(manifest.tests.map((t) => t.path))
  if (config.gates.noUntracked) {
    for (const p of onDisk) {
      if (!registered.has(p)) {
        findings.push({ gate: 'noUntracked', code: 'untracked', path: p, severity: 'fatal', message: 'on disk but not registered' })
      }
    }
  }
  if (config.gates.noStale) {
    for (const p of registered) {
      if (!onDisk.has(p)) {
        findings.push({ gate: 'noStale', code: 'stale', path: p, severity: 'fatal', message: 'registered but missing on disk' })
      }
    }
  }
  if (config.gates.requireTriggerForHighRisk) {
    for (const t of manifest.tests) {
      if ((t.risk === 'high' || t.risk === 'critical') && (!t.triggers || t.triggers.length === 0)) {
        findings.push({ gate: 'requireTriggerForHighRisk', code: 'high-risk-no-trigger', path: t.path, severity: 'fatal', message: `${t.risk}-risk test declares no trigger` })
      }
    }
  }
  return findings
}

/** Shell-test findings: no-assert / statically-skipped (fatal) and tautological (warn). */
export function detectShells(config: AssayConfig, manifest: TestManifest, host: AssayHost): AssayFinding[] {
  const expectRe = new RegExp(config.shellPatterns.expect)
  const staticSkipRe = new RegExp(config.shellPatterns.staticSkip)
  const tautologyRe = new RegExp(config.shellPatterns.tautology)
  const findings: AssayFinding[] = []
  for (const t of manifest.tests) {
    const src = host.readFile(t.path)
    if (src == null) continue // missing files are caught by `stale`
    if (!expectRe.test(src)) {
      findings.push({ gate: 'noShells', code: 'shell-no-expect', path: t.path, severity: 'fatal', message: 'no expect() assertions' })
    } else if (staticSkipRe.test(src)) {
      findings.push({ gate: 'noShells', code: 'shell-static-skip', path: t.path, severity: 'fatal', message: 'statically-skipped test block (registered but not running)' })
    }
    if (tautologyRe.test(src)) {
      findings.push({ gate: 'noShells', code: 'tautology', path: t.path, severity: 'warn', message: 'tautological assertion' })
    }
  }
  return findings
}

/**
 * Validate classification against the canonical taxonomy: category membership, subtype axis/value,
 * plane-subtraction discipline, and experimental (`x-local-*`) warnings. Entries without a
 * `category` are skipped — pre-taxonomy manifests stay valid.
 */
export function detectClassification(config: AssayConfig, manifest: TestManifest): AssayFinding[] {
  const findings: AssayFinding[] = []
  const experimental = new Set(config.taxonomy.experimentalCategories)
  for (const t of manifest.tests) {
    if (t.category == null) continue
    const cat = t.category as string
    if (!isCategory(cat)) {
      if (experimental.has(cat)) {
        findings.push({ gate: 'validClassification', code: 'experimental-category', path: t.path, category: cat, severity: 'warn', message: `experimental category '${cat}' — not counted toward canonical coverage` })
      } else {
        findings.push({ gate: 'validClassification', code: 'unknown-category', path: t.path, category: cat, severity: 'fatal', message: `unknown category '${cat}' (not in canonical taxonomy)` })
      }
      continue
    }
    const spec = categorySpec(cat)
    const axes = spec.subtypeAxes
    const axisNames = Object.keys(axes)
    if (t.subtypes && Object.keys(t.subtypes).length > 0) {
      for (const [axis, value] of Object.entries(t.subtypes)) {
        const allowed = (axes as Record<string, readonly string[]>)[axis]
        if (!allowed) {
          findings.push({ gate: 'validClassification', code: 'unknown-subtype-axis', path: t.path, category: cat, severity: 'fatal', message: `category '${cat}' has no subtype axis '${axis}' (axes: ${axisNames.join(', ') || 'none'})` })
        } else if (!allowed.includes(value)) {
          findings.push({ gate: 'validClassification', code: 'invalid-subtype', path: t.path, category: cat, severity: 'fatal', message: `subtype '${value}' invalid for axis '${axis}' of '${cat}' (allowed: ${allowed.join(', ')})` })
        }
      }
    } else if (axisNames.length > 0) {
      findings.push({ gate: 'validClassification', code: 'missing-subtype', path: t.path, category: cat, severity: 'warn', message: `category '${cat}' defines subtype axes (${axisNames.join(', ')}) but none declared` })
    }
    // Plane discipline: removing a default plane needs a reason; adding planes is free.
    if (t.planes) {
      const removed = spec.defaultPlanes.filter((p) => !t.planes!.includes(p))
      if (removed.length > 0 && !t.planeOverrideReason) {
        findings.push({ gate: 'validClassification', code: 'plane-subtraction-no-reason', path: t.path, category: cat, severity: 'fatal', details: { removed }, message: `removes default plane(s) ${removed.join(', ')} from '${cat}' without planeOverrideReason` })
      }
    }
  }
  return findings
}

/**
 * Author-separation checks assay CAN make statically: role membership for any categorized entry,
 * required author for governance-sensitive categories, and a reviewer distinct from the author for
 * high/critical governance-sensitive tests. Independence-from-implementer is NOT checked here — see
 * the ADR; that signal lives in cadre-os's loom, not the manifest.
 */
export function detectAuthorship(manifest: TestManifest): AssayFinding[] {
  const findings: AssayFinding[] = []
  for (const t of manifest.tests) {
    if (t.category == null || !isCategory(t.category)) continue
    const cat = t.category
    const spec = categorySpec(cat)
    const allowed = spec.allowedAuthors as readonly string[]
    const sensitive = isGovernanceSensitive(cat)
    if (t.author) {
      if (!allowed.includes(t.author)) {
        findings.push({ gate: 'authorSeparation', code: 'author-role-not-allowed', path: t.path, category: cat, severity: 'fatal', message: `author '${t.author}' not allowed for '${cat}' (allowed: ${allowed.join(', ')})` })
      }
    } else if (sensitive) {
      findings.push({ gate: 'authorSeparation', code: 'author-required', path: t.path, category: cat, severity: 'fatal', message: `governance-sensitive category '${cat}' requires an author (allowed: ${allowed.join(', ')})` })
    }
    const highRisk = t.risk === 'high' || t.risk === 'critical'
    if (sensitive && highRisk) {
      if (!t.reviewer) {
        findings.push({ gate: 'authorSeparation', code: 'reviewer-required', path: t.path, category: cat, severity: 'fatal', message: `${t.risk}-risk '${cat}' test requires a reviewer distinct from the author` })
      } else if (t.author && t.reviewer === t.author) {
        findings.push({ gate: 'authorSeparation', code: 'reviewer-not-independent', path: t.path, category: cat, severity: 'fatal', message: `reviewer must differ from author '${t.author}' on ${t.risk}-risk '${cat}'` })
      }
    }
  }
  return findings
}

/** A coverage matrix row: one (area, category) cell with declared/present/effective counts. */
export type CoverageRow = {
  area: string
  category: Category
  declared: number // manifest entries
  present: number // file exists on disk
  required: boolean
  need: number
  met: boolean
}

/**
 * Build the coverage matrix for the active profiles. Counts only EFFECTIVE tests — present on disk
 * (registered, non-stale). Evaluates every area that appears in the manifest plus any named in
 * areaProfiles/overrides, so a declared-but-empty area is still flagged.
 */
export function coverageMatrix(config: AssayConfig, manifest: TestManifest, onDisk: Set<string>): CoverageRow[] {
  const experimental = new Set(config.taxonomy.experimentalCategories)
  const counts = new Map<string, Map<string, { declared: number; present: number }>>()
  const bump = (area: string, cat: string, present: boolean) => {
    let byCat = counts.get(area)
    if (!byCat) counts.set(area, (byCat = new Map()))
    let c = byCat.get(cat)
    if (!c) byCat.set(cat, (c = { declared: 0, present: 0 }))
    c.declared += 1
    if (present) c.present += 1
  }
  const areas = new Set<string>([...Object.keys(config.coverage.areaProfiles), ...Object.keys(config.coverage.overrides)])
  for (const t of manifest.tests) {
    if (t.category == null || experimental.has(t.category as string)) continue
    const area = t.area ?? '(unassigned)'
    areas.add(area)
    bump(area, t.category, onDisk.has(t.path))
  }

  const rows: CoverageRow[] = []
  for (const area of [...areas].sort()) {
    const profileName = config.coverage.areaProfiles[area] ?? config.coverage.profile
    const profile = profileSpec(profileName)
    const byCat = counts.get(area)
    for (const cat of profile.requiredCategories) {
      let required = true
      let need = profile.minimumPerCategory
      const ov = config.coverage.overrides[area]?.[cat]
      if (ov) {
        if (ov.required === false) required = false
        if (ov.min != null) need = ov.min
      }
      const cell = byCat?.get(cat)
      const present = cell?.present ?? 0
      rows.push({ area, category: cat, declared: cell?.declared ?? 0, present, required, need, met: !required || present >= need })
    }
  }
  return rows
}

function detectCoverage(config: AssayConfig, manifest: TestManifest, onDisk: Set<string>): AssayFinding[] {
  return coverageMatrix(config, manifest, onDisk)
    .filter((r) => r.required && !r.met)
    .map((r): AssayFinding => ({
      gate: 'coverage',
      code: 'coverage-gap',
      area: r.area,
      category: r.category,
      severity: 'fatal',
      details: { present: r.present, need: r.need, declared: r.declared },
      message: `area '${r.area}' has ${r.present}/${r.need} effective ${r.category} tests`,
    }))
}

export function audit(config: AssayConfig, manifest: TestManifest, host: AssayHost): AuditReport {
  const onDisk = new Set(discoverTests(config, host))
  const findings: AssayFinding[] = [
    ...detectRegistry(config, manifest, onDisk),
    ...(config.gates.noShells ? detectShells(config, manifest, host) : []),
    ...(config.gates.validClassification ? detectClassification(config, manifest) : []),
    ...(config.gates.authorSeparation ? detectAuthorship(manifest) : []),
    ...(config.gates.coverage ? detectCoverage(config, manifest, onDisk) : []),
  ]
  // warnOnly: demote a gate's fatal findings to warn — the per-gate monitor primitive.
  const warn = new Set<GateName>(config.warnOnly)
  for (const f of findings) {
    if (f.severity === 'fatal' && warn.has(f.gate)) f.severity = 'warn'
  }
  return { findings, total: manifest.tests.length, onDisk: onDisk.size }
}

/** Findings for a single gate (convenience selector). */
export function findingsForGate(report: AuditReport, gate: GateName): AssayFinding[] {
  return report.findings.filter((f) => f.gate === gate)
}

/** True if the report contains any build-breaking (fatal) finding. */
export function isFatal(report: AuditReport): boolean {
  return report.findings.some((f) => f.severity === 'fatal')
}
