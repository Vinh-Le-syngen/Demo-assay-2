# @sys/rag

Thin TS contract + HTTP client for SYS **RAG** — grounded context packs with citations for AI workflows. The retrieval engine lives in cadre-os (Python); this package is the validated request/context-pack schemas and an adapter to call it.

**Plane:** data  ·  thin-client (engine in cadre-os)  ·  part of the `@sys/*` reusable-subsystem monorepo.

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@sys/rag": "file:vendor/sys-rag-0.0.1.tgz"
```

## API

- `defineRagConfig(config): RagConfig` — validate/normalize the client config via zod.
- `RagAdapter` (interface) — the call seam: `retrieve(request) → ContextPack`.
- `HttpRagAdapter` / `HttpAdapterOptions` — the default adapter that calls the cadre-os RAG service.
- `validateRetrievalRequest` / `validateContextPack` — parse + validate against the contract.
- `ragConfigSchema` / `retrievalRequestSchema` / `contextPackSchema` / `snippetSchema` / `citationSchema` — the zod schemas (the cross-language contract).
- `RagConfig`, `RetrievalRequest`, `ContextPack`, `SysAiError` (types).

## Usage

```ts
import { defineRagConfig, HttpRagAdapter } from '@sys/rag'

const config = defineRagConfig({ baseUrl: process.env.SYS_AI_URL! })
const rag = new HttpRagAdapter(config)

const pack = await rag.retrieve({ query: '…', topK: 8 })
// → { snippets: [...], citations: [...] }
```

## Extend via

Implement `RagAdapter` to point at a different transport/engine; the schemas stay the contract.
