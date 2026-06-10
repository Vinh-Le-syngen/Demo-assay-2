// @sys/pay — Observability. Emits; never decides. Inject a sink to forward payment
// events to your telemetry/audit (pino, Sentry, the ledger view). Default: no-op.

export interface PaymentSinkEvent {
  intentId: string
  type: string
  providerEventId?: string
  data?: Record<string, unknown>
}

export interface PaymentSink {
  emit(event: PaymentSinkEvent): void
}

export const noopSink: PaymentSink = { emit() {} }
