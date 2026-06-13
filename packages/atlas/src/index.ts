// @sys/atlas — dependency-graph impact analysis + propagation guard. A pure engine over a
// declared file dependency graph: compute the transitive impact set of a change, validate the
// graph's referential integrity, and detect propagation gaps (you changed X but not its declared
// dependents). The graph is data the project supplies; the engine is generic and IO-free.
// Run via the library API or the `sys-atlas` CLI (which loads a project atlas.config.mjs).
export * from './core'
export * from './config'
