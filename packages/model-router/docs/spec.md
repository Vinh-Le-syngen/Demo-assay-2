# @sys/model-router

**Plane:** Control (secondary: Governance, Observability).
**Engine:** cadre-os `lib/llm/dispatch.sh` (single source of truth). This package is a **thin
contract + HTTP client** — it does not make routing decisions itself.

## What it owns
- The request/decision/provider-capability **contract** (`schemas/`, zod in `schema.ts`).
- Config validation (`defineModelRouterConfig`).
- An `HttpModelRouterAdapter` calling `POST /v1/model/route` on the cadre-os AI gateway.

## What it does NOT own
- Prompt construction, retrieval, conversation state.
- The routing algorithm (lives in cadre-os).

## Usage
```ts
import { HttpModelRouterAdapter, validateModelRouteRequest } from "@sys/model-router";

const router = new HttpModelRouterAdapter({ baseUrl: process.env.SYS_AI_URL!, token: process.env.SYS_AI_TOKEN! });
const decision = await router.route(validateModelRouteRequest({
  schemaVersion: "1.0",
  requiredCapabilities: ["chat"],
  dataSovereignty: "qarar-customer",
}));
```

## Contract notes
- Every request/response carries `schemaVersion`. Bump on breaking change; never break silently.
- Errors arrive as `{ ok:false, error:{ code, message } }` → thrown as `SysAiError`.
- `dataSovereignty` is the governance hook: the engine denies providers not allowed for that
  data domain (reason code `POLICY_DENIED_SOVEREIGNTY`).
