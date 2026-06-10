// Fails if any @sys/* package imports an app-specific path. Keeps packages reusable:
// host concerns (permission model, event sink, backend) must be INJECTED, not imported.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FORBIDDEN = [/from\s+['"]@qarar\//, /from\s+['"].*\/apps\//, /from\s+['"]apps\//]
const root = join(fileURLToPath(new URL('..', import.meta.url)), 'packages')

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx|mjs|js)$/.test(entry)) out.push(full)
  }
  return out
}

let violations = 0
for (const file of walk(root)) {
  const src = readFileSync(file, 'utf8')
  for (const re of FORBIDDEN) {
    if (re.test(src)) {
      console.error(`boundary violation: ${file} matches ${re}`)
      violations++
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} boundary violation(s). @sys/* packages must not import app paths.`)
  process.exit(1)
}
console.log('boundaries ok: no app-specific imports in @sys/* packages')
