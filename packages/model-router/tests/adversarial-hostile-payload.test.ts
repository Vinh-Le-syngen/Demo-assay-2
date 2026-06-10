import { describe, it, expect } from "vitest";
import { HttpModelRouterAdapter } from "../src/adapter.js";
import { validateModelRouteRequest } from "../src/schema.js";

// adversarial / kind: resource-abuse — a hostile backend returns an oversized,
// prototype-pollution-laden decision payload. The adapter must validate via the
// schema without crashing, without polluting Object.prototype, and must not leak
// the attacker's extra/__proto__ keys back to the caller as part of the typed
// decision. A genuinely allow-able core still parses; the junk is discarded.

const req = validateModelRouteRequest({
  schemaVersion: "1.0",
  requiredCapabilities: ["chat"],
});

function mockFetch(rawBody: string): typeof fetch {
  return (async () =>
    new Response(rawBody, {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("HttpModelRouterAdapter — hostile oversized payload", () => {
  it("validates a polluted, oversized decision without leaking junk or polluting prototypes", async () => {
    const hugeReasonCodes = Array.from(
      { length: 5000 },
      (_, i) => `REASON_${i}`,
    );

    // Hand-craft JSON so __proto__ survives transport (object literals would not).
    const rawBody = JSON.stringify({
      ok: true,
      data: {
        schemaVersion: "1.0",
        decisionId: "d-hostile",
        outcome: "allow",
        provider: "anthropic",
        model: "claude-x",
        reasonCodes: hugeReasonCodes,
        policyVersion: "p1",
        injectedAdminFlag: true,
        "constructor.prototype.polluted": true,
      },
    }).replace(
      '"injectedAdminFlag":true',
      '"injectedAdminFlag":true,"__proto__":{"polluted":true}',
    );

    const adapter = new HttpModelRouterAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      fetchImpl: mockFetch(rawBody),
    });

    const decision = await adapter.route(req);

    // Core decision still parses correctly under load.
    expect(decision.outcome).toBe("allow");
    expect(decision.reasonCodes).toHaveLength(5000);

    // Unknown/hostile keys are stripped by the schema — not surfaced to the caller.
    expect((decision as Record<string, unknown>).injectedAdminFlag).toBeUndefined();
    expect((decision as Record<string, unknown>)["constructor.prototype.polluted"]).toBeUndefined();

    // No global prototype pollution occurred.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });
});
