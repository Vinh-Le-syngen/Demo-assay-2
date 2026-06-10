import { describe, it, expect } from "vitest";
import { HttpModelRouterAdapter, SysAiError } from "../src/adapter.js";
import { validateModelRouteRequest } from "../src/schema.js";

const req = validateModelRouteRequest({
  schemaVersion: "1.0",
  requiredCapabilities: ["chat"],
  dataSovereignty: "qarar-customer",
});

function mockFetch(payload: unknown, ok = true): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status: ok ? 200 : 422,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("HttpModelRouterAdapter", () => {
  it("returns a schema-valid decision on allow", async () => {
    const adapter = new HttpModelRouterAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      fetchImpl: mockFetch({
        ok: true,
        data: {
          schemaVersion: "1.0",
          decisionId: "d1",
          outcome: "allow",
          provider: "anthropic",
          model: "claude-x",
          reasonCodes: ["CAPABILITY_MATCH", "SOVEREIGNTY_OK"],
          policyVersion: "p1",
        },
      }),
    });
    const decision = await adapter.route(req);
    expect(decision.outcome).toBe("allow");
    expect(decision.provider).toBe("anthropic");
  });

  it("throws SysAiError on a deny/error envelope", async () => {
    const adapter = new HttpModelRouterAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      fetchImpl: mockFetch(
        { ok: false, error: { code: "POLICY_DENIED_SOVEREIGNTY", message: "no provider" } },
        false,
      ),
    });
    await expect(adapter.route(req)).rejects.toBeInstanceOf(SysAiError);
  });
});
