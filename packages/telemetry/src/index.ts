// @sys/telemetry — the structured-event spine for the Observability plane. The canonical
// envelope + taxonomy + correlation + redaction; the host injects the Sink (transport).
// Emit, never decide. Other members (errors, sentinel, herald, groundskeeper) emit this shape.
export * from './core'
export * from './types'
