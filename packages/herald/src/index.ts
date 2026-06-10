// @sys/herald — the reusable notification decision + delivery-harness subsystem. The pure
// NotificationPolicyEngine (planNotification) + the WhatsApp capability rule + idempotency contracts
// + all the vocabulary types. The host (e.g. Qarar apps/api/lib/notify) supplies the concrete
// adapters, persistence, credentials, event vocabulary, and policy config — never this package.
export * from './types'
export * from './core'
