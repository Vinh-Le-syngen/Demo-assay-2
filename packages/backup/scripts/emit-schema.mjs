import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
mkdirSync(dist, { recursive: true })

writeFileSync(
  join(dist, 'sys-backup.schema.json'),
  JSON.stringify(
    {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: '@sys/backup configuration',
      description: 'Incremental-backup config. Source, sink, and store seams are injected at runtime.',
      type: 'object',
      additionalProperties: false,
      properties: {
        maxAgeHours: {
          type: 'integer',
          minimum: 1,
          default: 25,
          description: 'Backup objects older than this are considered stale.',
        },
      },
    },
    null,
    2,
  ) + '\n',
)

console.log('emit-schema: wrote dist/sys-backup.schema.json')
