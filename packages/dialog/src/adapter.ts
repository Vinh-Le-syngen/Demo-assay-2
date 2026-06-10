import {
  validateDialogResult,
  type DialogRequest,
  type DialogResult,
} from "./schema.js";

export interface DialogAdapter {
  run(request: DialogRequest): Promise<DialogResult>;
}

export interface HttpAdapterOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class SysAiError extends Error {
  constructor(public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = "SysAiError";
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

/**
 * HTTP client for the cadre-os dialog endpoint. cadre-os owns the orchestration
 * (turn-taking, modes, composing RAG + model-router). This client does not orchestrate.
 */
export class HttpDialogAdapter implements DialogAdapter {
  constructor(private readonly opts: HttpAdapterOptions) {}

  async run(request: DialogRequest): Promise<DialogResult> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 180_000);
    let res: Response;
    try {
      res = await fetchImpl(`${this.opts.baseUrl}/v1/dialog/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.opts.token}`,
        },
        body: JSON.stringify(request),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new SysAiError("NETWORK", `dialog request failed: ${String(e)}`);
    } finally {
      clearTimeout(t);
    }

    const body = (await res.json()) as Envelope<unknown>;
    if (!body.ok) {
      throw new SysAiError(body.error.code, body.error.message, body.error.details);
    }
    return validateDialogResult(body.data);
  }
}
