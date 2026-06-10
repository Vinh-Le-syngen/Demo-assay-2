# @sys/herald

> **`@sys/herald` is the reusable notification decision + delivery-harness subsystem; the host
> application supplies vocabulary, policy, persistence, credentials, and side effects.**

Herald is an **engine, not an app notifier**. It owns the pure, deterministic decision layer —
*whether, when, how, and to whom* a noteworthy event may be communicated — and records why. Detection
systems (e.g. `@sys/sentinel`, `@sys/groundskeeper`) decide something is noteworthy; herald decides
what becomes of it.

## What's in here (pure, no I/O)
- `planNotification(intent policy + recipient preferences/consent + clock) → MessagePlan` — the
  `NotificationPolicyEngine`. Per channel: consent (never overridden) → capability → preference
  (overridable by escalation) → quiet hours (deferrable / bypassable for deadlines) → selected.
- `whatsappDeliverable(...)` — the Cloud API 24h-session / opt-in / approved-template rule.
- `eventKey` / `planKey` / `deliveryKey` — three-level idempotency contracts.
- The vocabulary types: `NotificationEvent` (the canonical envelope), `NotificationIntent`,
  `Classification`, `NotificationPolicy`, `MessagePlan`, `ChannelAdapter`, `RenderedMessage`, …

## What's NOT here (host owns it)
No Supabase, no provider credentials, no concrete service/party/country values, no country branches.
Herald is parameterized over the host's vocabulary — the same way a workflow engine is parameterized
over supplied workflow definitions. The host (e.g. `apps/api/src/lib/notify`) provides the tables,
channel adapters (in-app/email/WhatsApp Cloud API/SMS), event taxonomy, templates, policy config, and
the Inngest workers that run the outbox/retries/replay. Suppression is a first-class, audited outcome.

Same generic-core-vs-app-composition-root discipline as `@sys/billing`.
