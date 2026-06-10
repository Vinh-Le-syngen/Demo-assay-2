# @sys/dialog

Thin TS contract + HTTP client for SYS multi-party **dialog** (debate / council / panel). The engine lives in cadre-os; this package is just the validated request/result schemas and an adapter to call it.

**Plane:** control  ·  thin-client (engine in cadre-os)  ·  part of the `@sys/*` reusable-subsystem monorepo.

## Install

Vendored into consumers as a tarball today (registry publish deferred):

```json
"@sys/dialog": "file:vendor/sys-dialog-0.0.1.tgz"
```

## API

- `defineDialogConfig(config): DialogConfig` — validate/normalize the client config (base URL, mode, etc.) via zod.
- `DialogAdapter` (interface) — the call seam: `run(request) → DialogResult`.
- `HttpDialogAdapter` / `HttpAdapterOptions` — the default adapter that POSTs to the cadre-os dialog engine.
- `validateDialogRequest` / `validateDialogResult` — parse + validate payloads against the contract.
- `dialogConfigSchema` / `dialogRequestSchema` / `dialogResultSchema` / `dialogModeSchema` / `turnSchema` — the zod schemas (the cross-language contract).
- `DialogConfig`, `DialogMode`, `DialogRequest`, `DialogResult`, `SysAiError` (types).

## Usage

```ts
import { defineDialogConfig, HttpDialogAdapter } from '@sys/dialog'

const config = defineDialogConfig({ baseUrl: process.env.SYS_AI_URL! })
const dialog = new HttpDialogAdapter(config)

const result = await dialog.run({ mode: 'council', prompt: '…', parties: ['…'] })
```

## Extend via

Implement `DialogAdapter` to point at a different transport/engine; the schemas stay the contract.
