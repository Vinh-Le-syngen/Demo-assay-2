# @sys/rag

**Plane:** Data (secondary: Control, Observability).
**Engine:** cadre-os `services/sys-rag` (Python). This package is a **thin contract + HTTP
client** — no retrieval logic lives here.

## Owns
- Retrieval request / context-pack / citation **contract**.
- `validateContextPack` (enforces citations when required).
- `HttpRagAdapter` calling `POST /v1/rag/retrieve`.

## Does NOT own
- Embedding, chunking, vector stores, model selection, chat flow.

## Usage
```ts
import { HttpRagAdapter } from "@sys/rag";
const rag = new HttpRagAdapter({ baseUrl: process.env.SYS_AI_URL!, token: process.env.SYS_AI_TOKEN!, citationRequired: true });
const ctx = await rag.retrieve({ schemaVersion: "1.0", query: "latest approved-claim policy", scope: ["canon", "docs"] });
```

## Notes
- `citationRequired` fails closed: a pack with an uncited snippet throws.
- `dataSovereignty` tags the request so the engine can refuse disallowed corpora/providers.
