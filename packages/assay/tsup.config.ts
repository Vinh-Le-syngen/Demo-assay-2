import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    engine: 'src/engine.ts',
    config: 'src/config.ts',
    taxonomy: 'src/taxonomy.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  external: ['zod'],
  // Emit the canonical taxonomy as raw artifacts (json/yaml) + a manifest JSON Schema, so non-TS
  // runtimes (cadre-os bash) consume the SAME source of truth instead of a divergent copy.
  onSuccess: 'node scripts/emit-taxonomy.mjs',
})
