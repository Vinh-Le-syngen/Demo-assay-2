import { describe, it, expect } from "vitest";
import { HttpDialogAdapter, SysAiError } from "../src/adapter.js";
import { validateDialogRequest } from "../src/schema.js";

// negative — bad/invalid responses and inputs that must fail correctly.
//  - input-validation: a malformed success envelope (data violates the result schema)
//    must be rejected by validateDialogResult rather than returned as-is.
//  - unsupported: an `ok: false` error envelope must surface as a SysAiError carrying code.

function mockFetch(payload: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

const req = validateDialogRequest({
  schemaVersion: "1.0",
  mode: "debate",
  topic: "t",
  participants: ["a"],
});

describe("HttpDialogAdapter error and malformed envelopes (negative)", () => {
  it("rejects a success envelope whose data fails the result schema (input-validation)", async () => {
    const adapter = new HttpDialogAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      // status is a value outside the enum and transcript turn omits required `text`.
      fetchImpl: mockFetch({
        ok: true,
        data: {
          schemaVersion: "1.0",
          dialogId: "dlg-bad",
          mode: "debate",
          status: "finished-maybe",
          transcript: [{ index: 0, participant: "a" }],
        },
      }),
    });

    // validateDialogResult throws a ZodError (not SysAiError) — the adapter does not
    // swallow it, so an out-of-contract response can never reach the caller.
    await expect(adapter.run(req)).rejects.toThrow();
    await expect(adapter.run(req)).rejects.not.toBeInstanceOf(SysAiError);
  });
});
