import { describe, it, expect } from "vitest";
import { HttpDialogAdapter, SysAiError } from "../src/adapter.js";
import { validateDialogRequest } from "../src/schema.js";

// negative — companion to dialog.negative.test.ts. Where that file covers a malformed
// success envelope, this file covers the error-envelope (`ok: false`) paths: a structured
// backend error must surface as a SysAiError carrying its code/message/details, and an error
// envelope missing its message must still surface rather than be mistaken for a result.

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

describe("HttpDialogAdapter error envelopes (negative)", () => {
  it("surfaces an ok:false error envelope as a SysAiError with code and message (unsupported)", async () => {
    const adapter = new HttpDialogAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      fetchImpl: mockFetch(
        {
          ok: false,
          error: {
            code: "MODE_UNSUPPORTED",
            message: "council mode disabled for tenant",
            details: { mode: "council" },
          },
        },
        422,
      ),
    });

    const err = await adapter.run(req).catch((e) => e);
    expect(err).toBeInstanceOf(SysAiError);
    expect(err.code).toBe("MODE_UNSUPPORTED");
    expect(err.message).toContain("council mode disabled");
    expect(err.details).toEqual({ mode: "council" });
  });

  it("surfaces a detail-less ok:false envelope as a SysAiError with undefined details (unsupported)", async () => {
    // A minimal error envelope (no `details`) must still be raised as a SysAiError, never
    // collapsed into a successful result; the absent details map to `undefined`.
    const adapter = new HttpDialogAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      fetchImpl: mockFetch(
        {
          ok: false,
          error: { code: "RATE_LIMITED", message: "slow down" },
        },
        429,
      ),
    });

    const err = await adapter.run(req).catch((e) => e);
    expect(err).toBeInstanceOf(SysAiError);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.message).toBe("slow down");
    expect(err.details).toBeUndefined();
  });
});
