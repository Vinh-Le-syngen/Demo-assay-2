import { describe, it, expect } from "vitest";
import { HttpModelRouterAdapter } from "../src/adapter.js";
import { validateModelRouteRequest } from "../src/schema.js";

// negative / kind: input-validation — the backend claims success (ok:true) but
// the decision payload is malformed: it omits the required `policyVersion` and
// carries a bogus `outcome`. The adapter must NOT pass an unvalidated decision
// to the caller — validateModelRouteDecision must reject it.

const req = validateModelRouteRequest({
  schemaVersion: "1.0",
  requiredCapabilities: ["chat"],
});

function mockFetch(payload: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("HttpModelRouterAdapter — malformed decision rejection", () => {
  it("throws when the ok decision fails schema validation", async () => {
    const adapter = new HttpModelRouterAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      fetchImpl: mockFetch({
        ok: true,
        data: {
          schemaVersion: "1.0",
          decisionId: "d-bad",
          outcome: "maybe", // not in enum allow|deny
          reasonCodes: ["X"],
          // policyVersion intentionally missing
        },
      }),
    });

    await expect(adapter.route(req)).rejects.toThrow();
  });
});
