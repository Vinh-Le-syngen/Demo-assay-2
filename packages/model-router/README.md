# @sys/model-router

Thin TS contract + HTTP client for SYS **model routing** — selecting the provider/model for an LLM request by capability, policy, sovereignty, fallback, and cost. The routing engine lives in cadre-os; this package is the validated request/decision schemas and an adapter to call it.

**Plane:** control  ·  thin-client (engine in cadre-os)  ·  part of the `@sys/*` reusable-subsystem monorepo.

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@sys/model-router": "file:vendor/sys-model-router-0.0.1.tgz"
```

## API

- `defineModelRouterConfig(config): ModelRouterConfig` — validate/normalize the client config via zod.
- `ModelRouterAdapter` (interface) — the call seam: `route(request) → ModelRouteDecision`.
- `HttpModelRouterAdapter` / `HttpAdapterOptions` — the default adapter that calls the cadre-os router.
- `validateModelRouteRequest` / `validateModelRouteDecision` — parse + validate against the contract.
- `modelRouterConfigSchema` / `modelRouteRequestSchema` / `modelRouteDecisionSchema` / `providerCapabilitySchema` — the zod schemas (the cross-language contract).
- `ModelRouterConfig`, `ModelRouteRequest`, `ModelRouteDecision`, `ProviderCapability`, `SysAiError` (types).

## Usage

```ts
import { defineModelRouterConfig, HttpModelRouterAdapter } from '@sys/model-router'

const config = defineModelRouterConfig({ baseUrl: process.env.SYS_AI_URL! })
const router = new HttpModelRouterAdapter(config)

const decision = await router.route({ capability: 'reasoning', maxCostUsd: 0.05 })
// → { provider, model, reason, … }
```

## Extend via

Implement `ModelRouterAdapter` to point at a different transport/engine; the schemas stay the contract.
