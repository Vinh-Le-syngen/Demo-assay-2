import { describe, it, expect } from "vitest";
import { HttpRagAdapter, SysAiError } from "../src/adapter.js";
import type { RetrievalRequest } from "../src/schema.js";

const req: RetrievalRequest = {
  schemaVersion: "1.0",
  query: "policy",
  topK: 4,
  citationRequired: true,
};

function mockFetch(payload: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("rag negative error envelopes", () => {
  // unsupported / error-path: a backend error envelope surfaces as a typed SysAiError that
  // carries the server-supplied code, message and details rather than a generic throw.
  it("surfaces a backend error envelope as a coded SysAiError", async () => {
    const adapter = new HttpRagAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      fetchImpl: mockFetch(
        { ok: false, error: { code: "UNSUPPORTED_SCOPE", message: "scope not enabled", details: { scope: "hr" } } },
        422,
      ),
    });
    const err = await adapter.retrieve(req).catch((e) => e);
    expect(err).toBeInstanceOf(SysAiError);
    expect((err as SysAiError).code).toBe("UNSUPPORTED_SCOPE");
    expect((err as SysAiError).message).toBe("scope not enabled");
    expect((err as SysAiError).details).toEqual({ scope: "hr" });
  });
});
