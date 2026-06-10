// @sys/pay — root entry. Isomorphic, side-effect-free surface (contract, config, the
// pure intent machine, the bridge factory, observability types). Concrete providers
// (Stripe, local gateways) and the store/outbox are injected by the host app.

export * from './core/index'
export * from './observability/index'
