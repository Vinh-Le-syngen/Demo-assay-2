import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    core: 'src/core.ts',
    adapters: 'src/adapters.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  // Bundle the reused @sys engines INTO warden's dist so the vendored tarball / CLI bundle is
  // fully self-contained (no runtime @sys deps). This is what lets a non-node consumer (cadre-os)
  // run `node dist/cli.cjs` standalone.
  noExternal: [/@sys\//],
})
