import { describe, it, expect } from "vitest";
import { HttpRagAdapter } from "../src/adapter.js";
import type { RetrievalRequest } from "../src/schema.js";

const req: RetrievalRequest = {
  schemaVersion: "1.0",
  query: "claim approval policy",
  topK: 4,
  citationRequired: true,
};

// integration — HttpRagAdapter wired against a mocked HTTP backend.
describe("HttpRagAdapter external contract", () => {
  // external: the adapter speaks the documented HTTP contract to the remote endpoint —
  // POST to /v1/rag/retrieve, JSON body == request, bearer auth header.
  it("issues the documented HTTP request to the external endpoint", async () => {
    let seenUrl = "";
    let seenInit: RequestInit | undefined;
    const adapter = new HttpRagAdapter({
      baseUrl: "https://gw.test",
      token: "secret-token",
      fetchImpl: (async (url: string, init?: RequestInit) => {
        seenUrl = url;
        seenInit = init;
        return new Response(
          JSON.stringify({
            ok: true,
            data: {
              schemaVersion: "1.0",
              contextPackId: "cp",
              query: req.query,
              snippets: [{ text: "t", sourceId: "s1", citation: "canon#1" }],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as unknown as typeof fetch,
    });

    await adapter.retrieve(req);

    expect(seenUrl).toBe("https://gw.test/v1/rag/retrieve");
    expect(seenInit?.method).toBe("POST");
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer secret-token");
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(String(seenInit?.body))).toMatchObject({ query: req.query, topK: 4 });
  });
});
