import { defineConfig } from 'tsup'
export default defineConfig({
  entry: { index: 'src/index.ts', 'core/index': 'src/core/index.ts' },
  format: ['esm', 'cjs'], dts: true, sourcemap: true, clean: true, treeshake: true, splitting: false,
})
