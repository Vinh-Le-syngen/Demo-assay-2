import { describe, it, expect } from "vitest";
import { HttpModelRouterAdapter } from "../src/adapter.js";
import { validateModelRouteRequest } from "../src/schema.js";

// integration / kind: external — the adapter against a mocked external router
// backend that returns a full allow decision including a fallback chain and an
// estimated cost class. Asserts the adapter relays the backend's primary +
// fallback selection and cost estimate untouched (the engine lives server-side).

const req = validateModelRouteRequest({
  schemaVersion: "1.0",
  requiredCapabilities: ["chat", "long-context"],
  maxCostClass: "high",
});

function mockFetch(payload: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("HttpModelRouterAdapter — fallback chain relay", () => {
  it("relays primary selection, fallback chain, and cost estimate", async () => {
    const adapter = new HttpModelRouterAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      fetchImpl: mockFetch({
        ok: true,
        data: {
          schemaVersion: "1.0",
          decisionId: "d-chain",
          outcome: "allow",
          provider: "anthropic",
          model: "claude-opus",
          fallbackChain: ["anthropic/claude-sonnet", "openai/gpt-x"],
          reasonCodes: ["CAPABILITY_MATCH", "COST_WITHIN_BUDGET"],
          estCostClass: "high",
          policyVersion: "p3",
        },
      }),
    });

    const decision = await adapter.route(req);
    expect(decision.outcome).toBe("allow");
    expect(decision.provider).toBe("anthropic");
    expect(decision.model).toBe("claude-opus");
    expect(decision.fallbackChain).toEqual([
      "anthropic/claude-sonnet",
      "openai/gpt-x",
    ]);
    expect(decision.estCostClass).toBe("high");
  });
});
