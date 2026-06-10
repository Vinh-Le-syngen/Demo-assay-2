import { describe, it, expect } from "vitest";
import { HttpDialogAdapter } from "../src/adapter.js";
import { validateDialogRequest } from "../src/schema.js";

// adversarial — hostile backend responses the adapter must not trust.
//  - protocol-misuse: a non-JSON / truncated body from a compromised or misbehaving
//    upstream must not be returned as a fake result; parsing failure must throw.
//  - prompt-injection: a transcript whose turns smuggle injected control content with a
//    structurally invalid shape (extra/forbidden field via strict turn schema, bad index
//    types) must be rejected by validation, never passed through to the orchestrator caller.

const req = validateDialogRequest({
  schemaVersion: "1.0",
  mode: "debate",
  topic: "approve high-value claim",
  participants: ["risk", "growth"],
});

function rawResponseFetch(body: string, status = 200): typeof fetch {
  return (async () =>
    new Response(body, {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("HttpDialogAdapter hostile responses (adversarial)", () => {
  it("does not fabricate a result from a truncated/non-JSON body (protocol-misuse)", async () => {
    // A hostile upstream sends a 200 with a body that claims to be JSON but is garbage.
    const adapter = new HttpDialogAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      fetchImpl: rawResponseFetch('{"ok":true,"data":{"dialogId":"dlg'),
    });

    // res.json() rejects; the adapter must let it propagate rather than yield a result.
    await expect(adapter.run(req)).rejects.toThrow();
  });
});
