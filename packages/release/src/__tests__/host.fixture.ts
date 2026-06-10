// In-memory ReleaseHost for tests — no temp dirs, no tar shell-out.
import type { ReleaseHost, TarballManifest } from '../host'

export function memHost(
  files: Record<string, string>,
  tarballs: Record<string, TarballManifest> = {},
): ReleaseHost {
  return {
    readFile: (p) => files[p] ?? null,
    writeFile: (p, c) => {
      files[p] = c
    },
    exists: (p) => p in files,
    listFiles: (roots) =>
      Object.keys(files).filter((f) =>
        roots.some((r) => r === '.' || f === r || f.startsWith(`${r}/`)),
      ),
    readTarballManifest: (p) => tarballs[p] ?? null,
  }
}

export function pkgJson(name: string, version: string, priv = false): string {
  return JSON.stringify(priv ? { name, version, private: true } : { name, version })
}
