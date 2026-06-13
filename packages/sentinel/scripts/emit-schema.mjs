import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
mkdirSync(dist, { recursive: true })

writeFileSync(
  join(dist, 'sys-sentinel.schema.json'),
  JSON.stringify(
    {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: '@sys/sentinel configuration',
      description: 'Health-monitoring config. The `run` probe functions are injected at runtime.',
      type: 'object',
      required: ['probes'],
      additionalProperties: false,
      properties: {
        probes: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', minLength: 1 },
            },
          },
        },
        critical: {
          type: 'array',
          items: { type: 'string' },
          description: 'Probe names whose `down` makes the system unhealthy. Default: all probes.',
        },
      },
    },
    null,
    2,
  ) + '\n',
)

console.log('emit-schema: wrote dist/sys-sentinel.schema.json')
