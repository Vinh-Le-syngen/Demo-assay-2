// @sys/assay — the Node filesystem host (Data). Implements AssayHost over node:fs.
// cadre-os (Python/bash) doesn't use this — it invokes the CLI instead.

import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { AssayHost } from './engine'

export function nodeHost(root: string): AssayHost {
  return {
    listFiles(roots: string[]): string[] {
      const found: string[] = []
      const walk = (abs: string): void => {
        if (!existsSync(abs)) return
        for (const entry of readdirSync(abs)) {
          if (entry === 'node_modules') continue
          const p = join(abs, entry)
          if (statSync(p).isDirectory()) walk(p)
          else found.push(relative(root, p).split('\\').join('/'))
        }
      }
      for (const r of roots) walk(join(root, r))
      return found
    },
    readFile(relPath: string): string | null {
      const abs = join(root, relPath)
      return existsSync(abs) ? readFileSync(abs, 'utf8') : null
    },
  }
}
