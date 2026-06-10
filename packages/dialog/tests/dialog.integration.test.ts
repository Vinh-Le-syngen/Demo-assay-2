import { describe, it, expect } from "vitest";
import { HttpDialogAdapter } from "../src/adapter.js";
import { validateDialogRequest } from "../src/schema.js";

// integration (kind: external) — the HttpDialogAdapter exercised against a mocked HTTP
// backend that behaves like the cadre-os dialog endpoint: it inspects the request and
// returns a route-dependent envelope. This is the adapter + transport + schema validation
// working together end-to-end over fetch (no real network).

type Backend = (url: string, init: RequestInit) => Response;

function backendFetch(backend: Backend): typeof fetch {
  return ((url: string, init: RequestInit) => backend(url, init)) as unknown as typeof fetch;
}

/** A stand-in dialog service: echoes the requested mode/participants into a transcript. */
function dialogService(url: string, init: RequestInit): Response {
  if (!url.endsWith("/v1/dialog/run") || init.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "no route" } }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }
  const headers = init.headers as Record<string, string>;
  if (headers.authorization !== "Bearer good-key") {
    return new Response(
      JSON.stringify({ ok: false, error: { code: "UNAUTHENTICATED", message: "bad token" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  const body = JSON.parse(init.body as string);
  const transcript = (body.participants as string[]).map((p: string, index: number) => ({
    index,
    participant: p,
    text: `${p} weighs in on ${body.topic}`,
    modelDecisionId: `d-${index}`,
  }));
  const arbiterRequired = body.arbiter?.required === true;
  return new Response(
    JSON.stringify({
      ok: true,
      data: {
        schemaVersion: "1.0",
        dialogId: "dlg-int",
        mode: body.mode,
        contextPackId: body.retrieval?.enabled ? "cp-int" : undefined,
        status: arbiterRequired ? "awaiting_arbiter" : "completed",
        arbiterRequired: arbiterRequired || undefined,
        transcript,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("HttpDialogAdapter against a mocked dialog backend (integration/external)", () => {
  it("round-trips a panel request and maps participants into a validated transcript", async () => {
    const adapter = new HttpDialogAdapter({
      baseUrl: "https://gw.test",
      token: "good-key",
      fetchImpl: backendFetch(dialogService),
    });
    const req = validateDialogRequest({
      schemaVersion: "1.0",
      mode: "panel",
      topic: "renewal pricing",
      participants: ["risk", "growth", "ops"],
      retrieval: { enabled: true, query: "pricing policy" },
      arbiter: { required: true },
    });

    const res = await adapter.run(req);

    expect(res.dialogId).toBe("dlg-int");
    expect(res.mode).toBe("panel");
    expect(res.transcript.map((t) => t.participant)).toEqual(["risk", "growth", "ops"]);
    expect(res.transcript[1]!.text).toContain("renewal pricing");
    expect(res.contextPackId).toBe("cp-int");
    expect(res.status).toBe("awaiting_arbiter");
    expect(res.arbiterRequired).toBe(true);
  });
});
