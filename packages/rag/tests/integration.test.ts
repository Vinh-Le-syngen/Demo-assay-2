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
describe("HttpRagAdapter against mocked backend", () => {
  // intra-system: the adapter, schema validation, and the success envelope cooperate to
  // produce a fully-shaped, multi-snippet context pack from a backend response.
  it("retrieves and validates a multi-snippet pack from a success envelope", async () => {
    const adapter = new HttpRagAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              schemaVersion: "1.0",
              contextPackId: "cp-multi",
              query: req.query,
              snippets: [
                { text: "policy says A", sourceId: "s1", citation: "canon/policy#1", score: 0.91 },
                { text: "policy says B", sourceId: "s2", citation: "canon/policy#2", score: 0.74 },
              ],
              citations: [{ sourceId: "s1", citation: "canon/policy#1", uri: "https://x/1" }],
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )) as unknown as typeof fetch,
    });

    const pack = await adapter.retrieve(req);
    expect(pack.contextPackId).toBe("cp-multi");
    expect(pack.snippets).toHaveLength(2);
    expect(pack.snippets.map((s) => s.sourceId)).toEqual(["s1", "s2"]);
    expect(pack.citations?.[0].uri).toBe("https://x/1");
  });
});
