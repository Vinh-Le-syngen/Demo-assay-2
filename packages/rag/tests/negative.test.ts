import { describe, it, expect } from "vitest";
import { HttpRagAdapter } from "../src/adapter.js";
import { validateRetrievalRequest, validateContextPack } from "../src/schema.js";
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

describe("rag negative paths", () => {
  // input-validation: malformed inputs are rejected by the schema, not silently accepted.
  it("rejects an empty query and an out-of-range topK", () => {
    expect(() => validateRetrievalRequest({ schemaVersion: "1.0", query: "" })).toThrow();
    expect(() =>
      validateRetrievalRequest({ schemaVersion: "1.0", query: "q", topK: 99 }),
    ).toThrow();
  });

  // input-validation: a structurally malformed pack (snippet missing required fields) is
  // rejected at the shape layer regardless of citation policy.
  it("rejects a structurally malformed context pack", async () => {
    const adapter = new HttpRagAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      citationRequired: false,
      fetchImpl: mockFetch({
        ok: true,
        data: {
          schemaVersion: "1.0",
          contextPackId: "cp",
          query: "q",
          snippets: [{ text: "missing sourceId and citation" }],
        },
      }),
    });
    await expect(adapter.retrieve(req)).rejects.toThrow();
    // The direct validator agrees the shape is invalid.
    expect(() =>
      validateContextPack(
        { schemaVersion: "1.0", contextPackId: "cp", query: "q", snippets: [{ text: "x" }] },
        false,
      ),
    ).toThrow();
  });
});
