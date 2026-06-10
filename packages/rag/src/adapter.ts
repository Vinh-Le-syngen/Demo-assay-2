import {
  validateContextPack,
  type RetrievalRequest,
  type ContextPack,
} from "./schema.js";

export interface RagAdapter {
  retrieve(request: RetrievalRequest): Promise<ContextPack>;
}

export interface HttpAdapterOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  citationRequired?: boolean;
}

export class SysAiError extends Error {
  constructor(public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = "SysAiError";
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

export class HttpRagAdapter implements RagAdapter {
  constructor(private readonly opts: HttpAdapterOptions) {}

  async retrieve(request: RetrievalRequest): Promise<ContextPack> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 30_000);
    let res: Response;
    try {
      res = await fetchImpl(`${this.opts.baseUrl}/v1/rag/retrieve`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.opts.token}`,
        },
        body: JSON.stringify(request),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new SysAiError("NETWORK", `rag request failed: ${String(e)}`);
    } finally {
      clearTimeout(t);
    }

    const body = (await res.json()) as Envelope<unknown>;
    if (!body.ok) {
      throw new SysAiError(body.error.code, body.error.message, body.error.details);
    }
    return validateContextPack(body.data, this.opts.citationRequired ?? true);
  }
}
