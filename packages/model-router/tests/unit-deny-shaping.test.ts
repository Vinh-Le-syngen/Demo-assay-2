import { describe, it, expect } from "vitest";
import { HttpModelRouterAdapter } from "../src/adapter.js";
import { validateModelRouteRequest } from "../src/schema.js";

// unit / kind: io — the adapter shapes a server `deny` envelope into a typed,
// schema-valid decision WITHOUT a thrown error. A deny that the backend returns
// as `ok:true` (a routing verdict, not a transport error) must round-trip as
// outcome:"deny" with its reason codes intact.

const req = validateModelRouteRequest({
  schemaVersion: "1.0",
  requiredCapabilities: ["vision"],
  dataSovereignty: "qarar-customer",
});

function mockFetch(payload: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("HttpModelRouterAdapter — deny-verdict shaping", () => {
  it("returns a schema-valid decision on an ok deny verdict", async () => {
    const adapter = new HttpModelRouterAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      fetchImpl: mockFetch({
        ok: true,
        data: {
          schemaVersion: "1.0",
          decisionId: "d-deny",
          outcome: "deny",
          reasonCodes: ["NO_PROVIDER_FOR_CAPABILITY"],
          policyVersion: "p7",
        },
      }),
    });

    const decision = await adapter.route(req);
    expect(decision.outcome).toBe("deny");
    expect(decision.reasonCodes).toContain("NO_PROVIDER_FOR_CAPABILITY");
    expect(decision.policyVersion).toBe("p7");
    // A deny carries no provider/model — the adapter must not invent one.
    expect(decision.provider).toBeUndefined();
    expect(decision.model).toBeUndefined();
  });
});
