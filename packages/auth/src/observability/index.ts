// @sys/auth — Observability seam. sys-auth EMITS structured events; the host routes
// them to its logger/Sentry. The package never decides based on telemetry.

export type AuthEvent =
  | { type: 'authn.success'; userId: string }
  | { type: 'authn.failure'; reason: string }
  | { type: 'authz.granted'; userId: string; role: string }
  | { type: 'authz.denied'; userId: string; role: string; required: string[] }
  | { type: 'token.expired' }
  | { type: 'token.malformed' }

export interface AuthEventSink {
  emit(event: AuthEvent): void
}

/** Default sink — discards events. Apps inject their own. */
export const noopSink: AuthEventSink = { emit() {} }
