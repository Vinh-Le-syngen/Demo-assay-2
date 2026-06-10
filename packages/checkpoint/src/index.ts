// @sys/checkpoint — git-safety gate harness. A generic runner over named policy gates that
// inspect an injected git state, plus reusable gate builders (protected-branch, author,
// clean-tree, protected-path). Pure and IO-free; the project/CLI supplies the GitState.
// Run via the library API or the `sys-checkpoint` CLI. Extracted from cadre-os SYS-CHECKPOINT.
export * from './core'
export * from './gates'
