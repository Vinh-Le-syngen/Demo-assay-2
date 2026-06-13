// @sys/billing — root entry. Side-effect-free surface: the commercial-document model, the pure
// tax/numbering/document logic, the bridge factory, and the HTML renderer. Concrete policies are
// subpath exports (@sys/billing/policy-uae); the store is injected by the host app.

export * from './core/index'
export { renderDocumentHtml, RENDER_VERSION } from './render/invoice-html'
// The composition seam: build a policy from a spec, so the HOST owns rate values (which change /
// are business config) while the package owns the logic. Each country's default spec is exported
// from its policy subpath (e.g. UAE_SPEC from @sys/billing/policy-uae) for the host to override.
export { createJurisdictionPolicy, type JurisdictionPolicySpec } from './policies/factory'
export * from './config'
