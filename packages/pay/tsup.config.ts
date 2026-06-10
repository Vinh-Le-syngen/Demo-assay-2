import { defineConfig } from 'tsup'

// One entry per public subpath → predictable dist layout that matches package.json
// "exports". Dual ESM+CJS (consumed by both Next.js/ESM and the CommonJS API via tsx).
// zod stays external.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'observability/index': 'src/observability/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  external: ['zod'],
})
