import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
mkdirSync(dist, { recursive: true })

writeFileSync(
  join(dist, 'sys-gatekeeper.schema.json'),
  JSON.stringify(
    {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: '@sys/gatekeeper configuration',
      description: 'Promotion-policy config.',
      type: 'object',
      additionalProperties: false,
      properties: {
        edges: {
          type: 'array',
          items: {
            type: 'object',
            required: ['from', 'to'],
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
              risk: { type: 'string', enum: ['normal', 'risky', 'critical'] },
            },
          },
        },
        humanApprovalFor: { type: 'array', items: { type: 'string' } },
        reviewRisk: {
          type: 'array',
          items: { type: 'string', enum: ['normal', 'risky', 'critical'] },
        },
      },
    },
    null,
    2,
  ) + '\n',
)

console.log('emit-schema: wrote dist/sys-gatekeeper.schema.json')
