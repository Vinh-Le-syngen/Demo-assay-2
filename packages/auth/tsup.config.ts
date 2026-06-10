import { defineConfig } from 'tsup'

// One entry per public subpath → predictable dist layout that matches package.json
// "exports". ESM only (the package is type:module). Peer/runtime deps stay external.
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'server/index': 'src/server/index.ts',
    'react/index': 'src/react/index.tsx',
    'middleware/index': 'src/middleware/index.ts',
    'adapters/supabase': 'src/adapters/supabase.ts',
    'observability/index': 'src/observability/index.ts',
    'core/index': 'src/core/index.ts',
    'method-passkey': 'src/methods/method-passkey.ts',
    'method-national-id': 'src/methods/method-national-id.ts',
    'method-password': 'src/methods/method-password.ts',
    'method-oauth': 'src/methods/method-oauth.ts',
    'method-magiclink': 'src/methods/method-magiclink.ts',
    'method-otp': 'src/methods/method-otp.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  external: ['jose', 'zod', '@supabase/supabase-js', 'react', 'react/jsx-runtime'],
})
