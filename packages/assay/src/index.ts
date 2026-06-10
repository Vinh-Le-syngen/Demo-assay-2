// @sys/assay — test registry + quality gates. Generic engine; the host project supplies
// config (test roots, manifest, gates). The canonical test taxonomy is sys-owned (./taxonomy).
// Library API here; CLI at `sys-assay`.
export * from './taxonomy'
export * from './config'
export * from './engine'
export { nodeHost } from './node-host'
