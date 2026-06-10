// Emit the canonical taxonomy as cross-runtime artifacts after tsup builds dist/taxonomy.js.
// Produces:
//   dist/taxonomy.json         — the taxonomy data (bash/jq, cadre-os)
//   dist/taxonomy.yaml         — same, cadre-os's native format
//   dist/taxonomy.schema.json  — JSON Schema validating a MANIFEST against the canonical enums
// Single source of truth: everything here derives from src/taxonomy.ts (compiled to dist).

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { stringify as toYaml } from 'yaml'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')

const { TAXONOMY, CATEGORIES, PLANES, ROLES, RISKS } = await import(
  pathToFileURL(join(dist, 'taxonomy.js')).href
)

writeFileSync(join(dist, 'taxonomy.json'), JSON.stringify(TAXONOMY, null, 2) + '\n')
writeFileSync(join(dist, 'taxonomy.yaml'), toYaml(TAXONOMY))

// JSON Schema for a manifest, with canonical enums baked in — lets non-TS validators reject an
// unknown category/role/plane the same way the TS engine does.
const manifestSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://sys/assay.manifest.schema.json',
  title: '@sys/assay test manifest',
  description: `Generated from the canonical taxonomy (schema_version ${TAXONOMY.schema_version}, provenance ${TAXONOMY.provenance.source} v${TAXONOMY.provenance.source_schema_version}).`,
  type: 'object',
  required: ['tests'],
  properties: {
    tests: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path'],
        additionalProperties: true,
        properties: {
          path: { type: 'string' },
          risk: { enum: [...RISKS] },
          triggers: { type: 'array', items: { type: 'string' } },
          category: { enum: [...CATEGORIES] },
          subtypes: { type: 'object', additionalProperties: { type: 'string' } },
          area: { type: 'string' },
          author: { enum: [...ROLES] },
          reviewer: { enum: [...ROLES] },
          planes: { type: 'array', items: { enum: [...PLANES] } },
          planeOverrideReason: { type: 'string' },
        },
      },
    },
  },
}
writeFileSync(join(dist, 'taxonomy.schema.json'), JSON.stringify(manifestSchema, null, 2) + '\n')

console.log(
  `emit-taxonomy: wrote taxonomy.json, taxonomy.yaml, taxonomy.schema.json (v${TAXONOMY.schema_version}, ${CATEGORIES.length} categories)`,
)
