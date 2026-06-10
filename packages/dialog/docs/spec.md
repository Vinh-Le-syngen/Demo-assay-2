# @sys/dialog

**Plane:** Control (secondary: Observability).
**Engine:** cadre-os `lib/dialog/*` + `scripts/dialog-cli.sh`. This package is a **thin
contract + HTTP client**. cadre-os owns orchestration (turn-taking, modes, composing RAG +
model-router). This client does **not** orchestrate or call RAG/router directly.

## Owns
- Dialog request/result, mode, transcript **contract**.
- `HttpDialogAdapter` calling `POST /v1/dialog/run`.

## Does NOT own
- Retrieval internals, provider choice, the turn engine, arbitration logic.

## Modes
`debate`, `council`, `panel`, `copilot`, `review_loop`, `self-consistency`.
In debate: LLMs argue; the **human is the arbiter** (`status: "awaiting_arbiter"`), they do
not moderate each other.

## Usage
```ts
import { HttpDialogAdapter } from "@sys/dialog";
const dialog = new HttpDialogAdapter({ baseUrl: process.env.SYS_AI_URL!, token: process.env.SYS_AI_TOKEN! });
const res = await dialog.run({
  schemaVersion: "1.0",
  mode: "debate",
  topic: "Should this claim be approved?",
  participants: ["risk", "growth", "ops"],
  retrieval: { enabled: true, query: "claim approval policy" },
  arbiter: { required: true },
});
```

## Notes
- When `retrieval.enabled`, the engine attaches a `contextPackId` and per-turn `modelDecisionId`
  — full traceability across all three systems.
- Degrade: with `providerMode: "stub"` (or gateway down) returns `status: "degraded"`.
