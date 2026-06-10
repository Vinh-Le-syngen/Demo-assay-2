import { describe, it, expect } from "vitest";
import { HttpDialogAdapter } from "../src/adapter.js";
import { validateDialogRequest } from "../src/schema.js";

function mockFetch(payload: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("HttpDialogAdapter", () => {
  it("runs a debate and returns a validated transcript", async () => {
    const req = validateDialogRequest({
      schemaVersion: "1.0",
      mode: "debate",
      topic: "Should this claim be approved?",
      participants: ["risk", "growth", "ops"],
      retrieval: { enabled: true, query: "claim approval policy" },
      arbiter: { required: true },
    });
    const adapter = new HttpDialogAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      fetchImpl: mockFetch({
        ok: true,
        data: {
          schemaVersion: "1.0",
          dialogId: "dlg1",
          mode: "debate",
          contextPackId: "cp1",
          status: "awaiting_arbiter",
          arbiterRequired: true,
          transcript: [
            { index: 0, participant: "risk", text: "...", modelDecisionId: "d1" },
            { index: 1, participant: "growth", text: "...", modelDecisionId: "d2" },
          ],
        },
      }),
    });
    const res = await adapter.run(req);
    expect(res.mode).toBe("debate");
    expect(res.transcript).toHaveLength(2);
    expect(res.contextPackId).toBe("cp1");
    expect(res.status).toBe("awaiting_arbiter");
  });
});
