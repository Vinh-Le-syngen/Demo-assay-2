import { describe, it, expect } from "vitest";
import { HttpDialogAdapter, SysAiError } from "../src/adapter.js";
import { validateDialogRequest } from "../src/schema.js";

// integration (kind: external) — companion to dialog.integration.test.ts. Same mocked
// cadre-os dialog backend, transport, and schema validation working together end-to-end
// over fetch (no real network). This file covers the auth-rejection path: a request bearing
// the wrong token must have the backend's 401 envelope surfaced as a SysAiError.

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

describe("HttpDialogAdapter against a mocked dialog backend (integration/external) — auth path", () => {
  it("propagates the backend's auth-rejection envelope as a SysAiError", async () => {
    const adapter = new HttpDialogAdapter({
      baseUrl: "https://gw.test",
      token: "wrong-key",
      fetchImpl: backendFetch(dialogService),
    });
    const req = validateDialogRequest({
      schemaVersion: "1.0",
      mode: "debate",
      topic: "x",
      participants: ["a"],
    });

    await expect(adapter.run(req)).rejects.toMatchObject({
      name: "SysAiError",
      code: "UNAUTHENTICATED",
    });
    await expect(adapter.run(req)).rejects.toBeInstanceOf(SysAiError);
  });

  it("round-trips an authenticated request with retrieval/arbiter off into a completed dialog", async () => {
    // The complementary success branch to the round-trip in dialog.integration.test.ts:
    // no retrieval (so no contextPackId) and no arbiter (so status is `completed`, not
    // `awaiting_arbiter`). Exercises the other side of the backend's branching end-to-end.
    const adapter = new HttpDialogAdapter({
      baseUrl: "https://gw.test",
      token: "good-key",
      fetchImpl: backendFetch(dialogService),
    });
    const req = validateDialogRequest({
      schemaVersion: "1.0",
      mode: "debate",
      topic: "claim triage",
      participants: ["risk", "ops"],
    });

    const res = await adapter.run(req);

    expect(res.dialogId).toBe("dlg-int");
    expect(res.mode).toBe("debate");
    expect(res.status).toBe("completed");
    expect(res.arbiterRequired).toBeUndefined();
    expect(res.contextPackId).toBeUndefined();
    expect(res.transcript.map((t) => t.participant)).toEqual(["risk", "ops"]);
    expect(res.transcript[0]!.text).toContain("claim triage");
  });
});
