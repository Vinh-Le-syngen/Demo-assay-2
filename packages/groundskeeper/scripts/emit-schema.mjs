import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
mkdirSync(dist, { recursive: true })

writeFileSync(
  join(dist, 'sys-groundskeeper.schema.json'),
  JSON.stringify(
    {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: '@sys/groundskeeper configuration',
      description: 'Operational-hygiene detector config. The `run` detector functions are injected at runtime.',
      type: 'object',
      required: ['detectors'],
      additionalProperties: false,
      properties: {
        detectors: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
    null,
    2,
  ) + '\n',
)

console.log('emit-schema: wrote dist/sys-groundskeeper.schema.json')
