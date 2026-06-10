// @sys/release — workspace package discovery. Reads packages/*/package.json off the host;
// the source of truth for "what version is each package at right now".

import type { ReleaseHost } from './host'
import type { WorkspacePackage } from './types'

const PKG_RE = /^packages\/[^/]+\/package\.json$/

export function discoverWorkspacePackages(host: ReleaseHost): WorkspacePackage[] {
  const out: WorkspacePackage[] = []
  for (const rel of host.listFiles(['packages'])) {
    if (!PKG_RE.test(rel)) continue
    const raw = host.readFile(rel)
    if (raw == null) continue
    let pkg: { name?: string; version?: string; private?: boolean }
    try {
      pkg = JSON.parse(raw) as typeof pkg
    } catch {
      continue
    }
    if (!pkg.name || !pkg.version) continue
    out.push({
      name: pkg.name,
      version: pkg.version,
      path: rel.replace(/\/package\.json$/, ''),
      private: pkg.private === true,
    })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
