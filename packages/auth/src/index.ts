// @sys/auth — root entry. Isomorphic, side-effect-free surface (contract, config,
// observability types). Server crypto and the Supabase adapter are subpath-only
// (`@sys/auth/server`, `@sys/auth/adapters/supabase`) so they stay out of client bundles.

export * from './core/index'
export * from './observability/index'
