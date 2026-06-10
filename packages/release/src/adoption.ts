// @sys/release — adoption validation (consumer-side). Diffs a product's sys.lock.json claim
// against what it actually declares across ALL its workspace manifests (root + apps/* +
// packages/*), AND vendored tarball metadata. Two headline checks:
//   - a `file:vendor/foo-1.1.0.tgz` dep whose tarball is really 1.0.0 (metadata mismatch)
//   - a vendored tarball whose internal @sys/@eng dep the consumer can't resolve (gap B)

import type { ReleaseHost } from './host'
import type { AdoptionMode, AdoptionRecord, ReleaseFinding, ReleaseSet } from './types'

export interface ProductManifest {
  /** directory relative to the consumer root ('' for the root manifest) — file: specs resolve from here. */
  dir: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export interface ValidateAdoptionArgs {
  lock: AdoptionRecord
  /** ALL workspace manifests (gap A — not just the root). Use discoverConsumerManifests(). */
  manifests: ProductManifest[]
  host: ReleaseHost
  /** the release set the product claims to adopt, if available to cross-check */
  releaseSet?: ReleaseSet
  /** the consumer's pnpm.overrides — lets a transitive vendored dep resolve (gap B). */
  overrides?: Record<string, string>
}

const VALID_MODES: ReadonlySet<string> = new Set<AdoptionMode>(['warn', 'strict', 'off'])
const INTERNAL = /^@(sys|eng)\//

/** Strip a leading range operator (^ ~ >= …) so `^1.1.0` compares to `1.1.0`. */
function normalizeRange(spec: string): string {
  return spec.replace(/^[\^~>=<\s]+/, '').trim()
}

/** Resolve a relative path against a manifest dir, collapsing `.`/`..` (POSIX, no node:path). */
function joinRel(dir: string, rel: string): string {
  const out: string[] = []
  for (const seg of (dir ? dir.split('/') : []).concat(rel.split('/'))) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return out.join('/')
}

/** Discover every workspace manifest under the consumer root (excludes node_modules/vendor). */
export function discoverConsumerManifests(host: ReleaseHost): ProductManifest[] {
  const out: ProductManifest[] = []
  for (const rel of host.listFiles(['.'])) {
    if (!rel.endsWith('package.json')) continue
    if (rel.includes('/node_modules/') || rel.includes('/vendor/')) continue
    const raw = host.readFile(rel)
    if (raw == null) continue
    try {
      const pkg = JSON.parse(raw) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      out.push({
        dir: rel === 'package.json' ? '' : rel.replace(/\/?package\.json$/, ''),
        dependencies: pkg.dependencies,
        devDependencies: pkg.devDependencies,
      })
    } catch {
      /* skip unparseable */
    }
  }
  return out
}

export function validateAdoption(args: ValidateAdoptionArgs): ReleaseFinding[] {
  const { lock, manifests, host, releaseSet, overrides } = args
  const findings: ReleaseFinding[] = []

  // Index every declared dependency across all manifests → first declaration wins.
  const declared = new Map<string, { spec: string; dir: string }>()
  for (const m of manifests) {
    for (const [n, s] of Object.entries({
      ...(m.dependencies ?? {}),
      ...(m.devDependencies ?? {}),
    })) {
      if (!declared.has(n)) declared.set(n, { spec: s, dir: m.dir })
    }
  }
  // Will pnpm resolve a vendored tarball's TRANSITIVE `@sys/X` (a registry spec)? Only if it's
  // forced by a pnpm.overrides, OR declared somewhere as a *registry* (non-file:) dep pnpm can
  // fetch. A top-level `file:` declaration does NOT satisfy it — that's the ERR_PNPM_FETCH_404
  // we hit in Qarar (the override is the interim mechanism until the dep is published).
  const isTransitivelyResolvable = (name: string): boolean => {
    if (overrides && name in overrides) return true
    const decl = declared.get(name)
    return decl !== undefined && !decl.spec.startsWith('file:')
  }

  if (lock.adopts?.release_set && releaseSet) {
    const expected = `${releaseSet.name}@${releaseSet.version}`
    if (lock.adopts.release_set !== expected) {
      findings.push({
        code: 'adoption_release_set_mismatch',
        severity: 'blocker',
        message: `lock adopts "${lock.adopts.release_set}" but the validated set is "${expected}"`,
      })
    }
  }

  for (const [name, lockVer] of Object.entries(lock.packages)) {
    if (releaseSet) {
      const setVer = releaseSet.packages[name]
      if (setVer && setVer !== lockVer) {
        findings.push({
          code: 'release_set_version_mismatch',
          severity: 'blocker',
          message: `lock pins ${name}@${lockVer} but the release set has ${setVer}`,
          package: name,
        })
      }
    }

    const decl = declared.get(name)
    if (!decl) {
      findings.push({
        code: 'adoption_package_missing',
        severity: 'blocker',
        message: `lock claims ${name}@${lockVer} but no workspace manifest declares a dependency on it`,
        package: name,
      })
      continue
    }

    if (decl.spec.startsWith('file:')) {
      const tarballPath = joinRel(decl.dir, decl.spec.slice('file:'.length))
      const manifest = host.readTarballManifest(tarballPath)
      if (!manifest) {
        findings.push({
          code: 'tarball_unreadable',
          severity: 'blocker',
          message: `cannot read vendored tarball for ${name} at ${tarballPath}`,
          package: name,
          path: tarballPath,
        })
        continue
      }
      if (manifest.name !== name) {
        findings.push({
          code: 'tarball_metadata_mismatch',
          severity: 'blocker',
          message: `${tarballPath} declares package "${manifest.name}", expected "${name}"`,
          package: name,
          path: tarballPath,
        })
      }
      if (manifest.version !== lockVer) {
        findings.push({
          code: 'adoption_package_version_mismatch',
          severity: 'blocker',
          message: `lock pins ${name}@${lockVer} but vendored tarball ${tarballPath} is ${manifest.version}`,
          package: name,
          path: tarballPath,
        })
      }
      // Gap B: the tarball's own @sys/@eng deps must be resolvable, else pnpm install 404s.
      for (const depName of Object.keys(manifest.dependencies ?? {})) {
        if (!INTERNAL.test(depName) || isTransitivelyResolvable(depName)) continue
        findings.push({
          code: 'tarball_dep_unsatisfiable',
          severity: 'warning',
          message: `vendored ${name} depends on ${depName} (a registry spec), which is not forced by a pnpm.overrides nor declared as a registry dep — pnpm install will fail to resolve it (add pnpm.overrides: { "${depName}": "file:vendor/…tgz" } until it is registry-published)`,
          package: depName,
          path: tarballPath,
        })
      }
    } else if (normalizeRange(decl.spec) !== lockVer) {
      findings.push({
        code: 'adoption_package_version_mismatch',
        severity: 'blocker',
        message: `lock pins ${name}@${lockVer} but the product depends on ${name}@${decl.spec}`,
        package: name,
      })
    }
  }

  for (const [key, mode] of Object.entries(lock.modes ?? {})) {
    if (!VALID_MODES.has(mode)) {
      findings.push({
        code: 'invalid_adoption_mode',
        severity: 'warning',
        message: `adoption mode "${String(mode)}" for "${key}" is not one of warn|strict|off`,
      })
    }
  }

  return findings
}
