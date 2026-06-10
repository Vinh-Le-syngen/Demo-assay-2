import { describe, it, expect } from "vitest";
import { HttpRagAdapter, SysAiError } from "../src/adapter.js";

function mockFetch(payload: unknown, ok = true): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status: ok ? 200 : 422,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

const req = { schemaVersion: "1.0" as const, query: "claim approval policy", topK: 4, citationRequired: true };

describe("HttpRagAdapter", () => {
  it("returns a validated context pack", async () => {
    const adapter = new HttpRagAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      fetchImpl: mockFetch({
        ok: true,
        data: {
          schemaVersion: "1.0",
          contextPackId: "cp1",
          query: req.query,
          snippets: [{ text: "policy says X", sourceId: "s1", citation: "canon/policy#3" }],
        },
      }),
    });
    const pack = await adapter.retrieve(req);
    expect(pack.snippets).toHaveLength(1);
    expect(pack.snippets[0].citation).toBe("canon/policy#3");
  });

  it("rejects a pack missing citations when citationRequired", async () => {
    const adapter = new HttpRagAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      citationRequired: true,
      fetchImpl: mockFetch({
        ok: true,
        data: {
          schemaVersion: "1.0",
          contextPackId: "cp2",
          query: req.query,
          snippets: [{ text: "x", sourceId: "s1", citation: "" }],
        },
      }),
    });
    await expect(adapter.retrieve(req)).rejects.toThrow(/missing citations/);
  });

  it("throws SysAiError on error envelope", async () => {
    const adapter = new HttpRagAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      fetchImpl: mockFetch({ ok: false, error: { code: "ENGINE_ERROR", message: "down" } }, false),
    });
    await expect(adapter.retrieve(req)).rejects.toBeInstanceOf(SysAiError);
  });
});
