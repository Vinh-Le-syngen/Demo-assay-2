import {
  validateModelRouteDecision,
  type ModelRouteRequest,
  type ModelRouteDecision,
} from "./schema.js";

/** The seam: any backend that can turn a route request into a decision. */
export interface ModelRouterAdapter {
  route(request: ModelRouteRequest): Promise<ModelRouteDecision>;
}

export interface HttpAdapterOptions {
  baseUrl: string;
  token: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class SysAiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "SysAiError";
  }
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

/** HTTP client for the cadre-os model-router endpoint. The engine stays in cadre-os. */
export class HttpModelRouterAdapter implements ModelRouterAdapter {
  constructor(private readonly opts: HttpAdapterOptions) {}

  async route(request: ModelRouteRequest): Promise<ModelRouteDecision> {
    const fetchImpl = this.opts.fetchImpl ?? fetch;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 30_000);
    let res: Response;
    try {
      res = await fetchImpl(`${this.opts.baseUrl}/v1/model/route`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.opts.token}`,
        },
        body: JSON.stringify(request),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new SysAiError("NETWORK", `model-router request failed: ${String(e)}`);
    } finally {
      clearTimeout(t);
    }

    const body = (await res.json()) as Envelope<unknown>;
    if (!body.ok) {
      throw new SysAiError(body.error.code, body.error.message, body.error.details);
    }
    return validateModelRouteDecision(body.data);
  }
}
