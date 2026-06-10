import { defineConfig } from 'tsup'

// Records-only library (schemas + validation + policy data). No CLI here — decisions/CLI live in
// @eng/governance.
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  external: ['zod'],
})
