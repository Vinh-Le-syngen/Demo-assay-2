import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
mkdirSync(dist, { recursive: true })

writeFileSync(
  join(dist, 'sys-atlas.schema.json'),
  JSON.stringify(
    {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: '@sys/atlas configuration',
      description: 'Dependency-graph config.',
      type: 'object',
      required: ['files'],
      additionalProperties: false,
      properties: {
        version: { type: 'integer', minimum: 1 },
        files: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              criticality: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
              dependsOn: { type: 'array', items: { type: 'string' } },
              consumers: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    null,
    2,
  ) + '\n',
)

console.log('emit-schema: wrote dist/sys-atlas.schema.json')
