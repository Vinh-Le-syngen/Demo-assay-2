# @sys/consent

Cookie/script **consent**: a category vocabulary + a pure ALLOW/DENY decision engine ("may this technology run?") + the consent-decision contract + a system-of-record service. The host supplies the concrete vendor registry, persistence (store), event sink, and UI. Distinct from authenticated *processing*-consent (e.g. PDPL), which the host owns separately.

**Plane:** governance (primary), data  ·  part of the `@sys/*` reusable-subsystem monorepo.

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@sys/consent": "file:vendor/sys-consent-0.0.1.tgz"
```

## API

**Decision engine (pure):**
- `canUse(category, ctx): boolean` — may a category (analytics, marketing, …) run given the consent context?
- `canLoadVendor(vendor, ctx): boolean` — may a specific vendor load (its category must be granted)?
- `requiresReprompt(ctx): boolean` — does the stored consent need re-collecting (policy version changed / expired / never set)?
- `buildCategories(...)` — assemble the category vocabulary (defaults + host additions).

**Vocabulary:** `CONSENT_CATEGORIES`, `ALL_CONSENT_CATEGORIES`, `NON_ESSENTIAL_CATEGORIES`, `ConsentCategory`, `CategoryChoice`, `ConsentCategoryInfo`.

**Contract + seams:** `ConsentDecision`, `ConsentContext`, `ConsentRecord`, `ConsentVendor`, `ConsentSource`, `ConsentStore` (persistence seam), `ConsentEvent` / `ConsentEventType` / `ConsentEventSink` (audit seam).

**System of record:** `createConsentService({ store, events, … }): ConsentService` — record/query consent decisions over the injected store + event sink.

## Usage

```ts
import { canUse, canLoadVendor, createConsentService } from '@sys/consent'

if (canUse('analytics', ctx)) initAnalytics()
if (canLoadVendor(googleMaps, ctx)) loadMaps()

const consent = createConsentService({ store, events })
await consent.record({ subjectId, choices: { analytics: 'granted' }, source: 'banner' })
```

## Extend via

The vendor registry, the `ConsentStore` (persistence), the `ConsentEventSink` (audit), and the UI — all host-injected.
