import { describe, it, expect } from "vitest";
import { HttpDialogAdapter } from "../src/adapter.js";
import { validateDialogRequest } from "../src/schema.js";

// unit (kind: io) — adapter request shaping over a mocked fetch: verifies the client
// builds the correct URL, method, auth header, and JSON body without orchestrating.
function captureFetch(payload: unknown): {
  impl: typeof fetch;
  calls: Array<{ url: string; init: RequestInit }>;
} {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const okPayload = {
  ok: true,
  data: {
    schemaVersion: "1.0",
    dialogId: "dlg-unit",
    mode: "council",
    status: "completed",
    transcript: [{ index: 0, participant: "a", text: "hi" }],
  },
};

describe("HttpDialogAdapter request shaping (unit/io)", () => {
  it("POSTs the request as JSON to /v1/dialog/run with a bearer token", async () => {
    const { impl, calls } = captureFetch(okPayload);
    const req = validateDialogRequest({
      schemaVersion: "1.0",
      mode: "council",
      topic: "budget allocation",
      participants: ["a", "b"],
    });
    const adapter = new HttpDialogAdapter({
      baseUrl: "https://gw.test",
      token: "secret-token",
      fetchImpl: impl,
    });

    await adapter.run(req);

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe("https://gw.test/v1/dialog/run");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer secret-token");
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toMatchObject({
      mode: "council",
      topic: "budget allocation",
      participants: ["a", "b"],
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
