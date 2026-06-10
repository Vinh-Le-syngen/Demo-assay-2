import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'policy-uae': 'src/policies/uae.ts',
    'policy-sg': 'src/policies/sg.ts',
    'policy-es': 'src/policies/es.ts',
    'policy-vn': 'src/policies/vn.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  external: ['zod'],
})
