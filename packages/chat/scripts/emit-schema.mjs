// Emits the declarative JSON Schema for @sys/chat configuration.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')

const configSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://sys/chat.config.schema.json',
  title: '@sys/chat configuration',
  description: 'Configuration for the @sys/chat session manager.',
  type: 'object',
  additionalProperties: false,
  properties: {
    maxTurns: {
      type: 'integer',
      minimum: 1,
      maximum: 10000,
      default: 200,
      description: 'Maximum messages in a session before it auto-closes.'
    },
    turnPolicy: {
      type: 'string',
      enum: ['strict-alternation', 'free-form'],
      default: 'strict-alternation',
      description: 'Turn-ordering policy.'
    }
  }
}

writeFileSync(join(dist, 'sys-chat.schema.json'), JSON.stringify(configSchema, null, 2) + '\n')

console.log('emit-schema: wrote sys-chat.schema.json')
