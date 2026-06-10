// @sys/release — the IO seam (Data plane). Pure core takes a ReleaseHost so it runs
// against an in-memory host in tests and a node:fs host at the CLI. The tarball reader is
// part of the seam because reading packed-artifact metadata is the headline adoption check.

export interface TarballManifest {
  name: string
  version: string
  /** the tarball's own runtime deps — used to check transitive resolvability (gap B). */
  dependencies?: Record<string, string>
}

export interface ReleaseHost {
  /** File contents by path relative to root, or null if missing. */
  readFile(relPath: string): string | null
  /** Write a file (creating parent dirs), path relative to root. */
  writeFile(relPath: string, contents: string): void
  exists(relPath: string): boolean
  /** All file paths (relative to root) under the given roots, excluding node_modules/.git. */
  listFiles(roots: string[]): string[]
  /** name+version from a packed npm tarball's `package/package.json`, or null if unreadable. */
  readTarballManifest(relPath: string): TarballManifest | null
}
