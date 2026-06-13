import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
mkdirSync(dist, { recursive: true })

writeFileSync(
  join(dist, 'eng-governance.schema.json'),
  JSON.stringify(
    {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: '@eng/governance configuration',
      description: 'Governance config. Claim/capability data is validated at runtime via @sys/canon schemas.',
      type: 'object',
      additionalProperties: true,
      properties: {
        restricted: { description: 'RestrictedClaimsConfig data (validated by @sys/canon)' },
        approved: { description: 'ApprovedClaimsConfig data (validated by @sys/canon)' },
        capabilities: { description: 'CapabilityInventoryConfig data (validated by @sys/canon)' },
        choices: { description: 'ChoicesConfig data (validated by @sys/canon)' },
        serviceAuthority: { description: 'ServiceAuthorityConfig data (validated by @sys/canon)' },
      },
    },
    null,
    2,
  ) + '\n',
)

console.log('emit-schema: wrote dist/eng-governance.schema.json')
