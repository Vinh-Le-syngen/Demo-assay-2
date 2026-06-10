import { describe, it, expect } from "vitest";
import { HttpModelRouterAdapter } from "../src/adapter.js";
import { validateModelRouteRequest } from "../src/schema.js";

// integration / kind: intra-system — the adapter against a mocked HTTP router
// backend. Asserts the wire contract the adapter and backend share: the POST
// hits /v1/model/route, carries the bearer token + JSON body, and the request
// body is exactly the validated ModelRouteRequest.

const req = validateModelRouteRequest({
  schemaVersion: "1.0",
  requiredCapabilities: ["chat", "tools"],
  allowedProviders: ["anthropic"],
  dataSovereignty: "qarar-customer",
  maxCostClass: "medium",
  tenant: "acme",
  journeyId: "j-42",
});

describe("HttpModelRouterAdapter — request contract", () => {
  it("issues the correct POST to the backend route endpoint", async () => {
    let seenUrl: string | undefined;
    let seenInit: RequestInit | undefined;

    const fetchImpl = (async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenInit = init;
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            schemaVersion: "1.0",
            decisionId: "d-ok",
            outcome: "allow",
            provider: "anthropic",
            model: "claude-x",
            reasonCodes: ["CAPABILITY_MATCH"],
            policyVersion: "p1",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const adapter = new HttpModelRouterAdapter({
      baseUrl: "https://gw.test",
      token: "secret-token",
      fetchImpl,
    });

    const decision = await adapter.route(req);
    expect(decision.outcome).toBe("allow");

    expect(seenUrl).toBe("https://gw.test/v1/model/route");
    expect(seenInit?.method).toBe("POST");
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer secret-token");
    expect(headers["content-type"]).toBe("application/json");
    expect(JSON.parse(seenInit?.body as string)).toEqual(req);
  });
});
