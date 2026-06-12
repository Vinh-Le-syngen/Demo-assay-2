import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
mkdirSync(dist, { recursive: true })

writeFileSync(
  join(dist, 'sys-warden.schema.json'),
  JSON.stringify(
    {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: '@sys/warden configuration',
      description: 'Worktree-lifecycle config. The `isAlive` function is injected at runtime.',
      type: 'object',
      additionalProperties: false,
      properties: {
        graceMs: {
          type: 'integer',
          minimum: 1,
          default: 30000,
          description: 'Milliseconds after which an inactive worktree is considered stale.',
        },
      },
    },
    null,
    2,
  ) + '\n',
)

console.log('emit-schema: wrote dist/sys-warden.schema.json')
