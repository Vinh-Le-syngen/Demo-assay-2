// @sys/warp — config cross-validation harness. Generic check runner + reusable check
// builders (referential integrity, required mappings, schema-genericity SQL scanner).
// Projects supply their own checks; run via the library API or the `sys-warp` CLI.
export * from './core'
export * from './checks'
