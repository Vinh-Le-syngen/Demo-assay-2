// @sys/release — the node:fs host (Data). The CLI uses this; cross-runtime consumers that
// only validate sets/locks can implement ReleaseHost themselves. readTarballManifest shells
// out to `tar` to read the packed package.json without unpacking the whole artifact.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import type { ReleaseHost, TarballManifest } from './host'

export function nodeHost(root: string): ReleaseHost {
  const abs = (p: string): string => join(root, p)
  return {
    readFile(relPath: string): string | null {
      const p = abs(relPath)
      return existsSync(p) ? readFileSync(p, 'utf8') : null
    },
    writeFile(relPath: string, contents: string): void {
      const p = abs(relPath)
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, contents)
    },
    exists(relPath: string): boolean {
      return existsSync(abs(relPath))
    },
    listFiles(roots: string[]): string[] {
      const found: string[] = []
      const walk = (dir: string): void => {
        let entries: string[]
        try {
          entries = readdirSync(dir)
        } catch {
          return // unreadable dir
        }
        for (const entry of entries) {
          if (entry === 'node_modules' || entry === '.git') continue
          const p = join(dir, entry)
          let st
          try {
            // lstat: do NOT follow symlinks — a dangling link must not throw, and we never
            // recurse through links (avoids cycles + ENOENT on broken links).
            st = lstatSync(p)
          } catch {
            continue
          }
          if (st.isDirectory()) walk(p)
          else if (st.isFile()) found.push(relative(root, p).split('\\').join('/'))
        }
      }
      for (const r of roots) walk(abs(r))
      return found
    },
    readTarballManifest(relPath: string): TarballManifest | null {
      const p = abs(relPath)
      if (!existsSync(p)) return null
      try {
        const out = execFileSync('tar', ['-xOf', p, 'package/package.json'], {
          encoding: 'utf8',
        })
        const json = JSON.parse(out) as {
          name?: unknown
          version?: unknown
          dependencies?: unknown
        }
        if (typeof json.name === 'string' && typeof json.version === 'string') {
          const deps =
            json.dependencies && typeof json.dependencies === 'object'
              ? (json.dependencies as Record<string, string>)
              : undefined
          return { name: json.name, version: json.version, dependencies: deps }
        }
        return null
      } catch {
        return null
      }
    },
  }
}
