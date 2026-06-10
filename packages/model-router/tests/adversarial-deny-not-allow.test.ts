import { describe, it, expect } from "vitest";
import { HttpModelRouterAdapter, SysAiError } from "../src/adapter.js";
import { validateModelRouteRequest } from "../src/schema.js";

// adversarial / kind: protocol-misuse — a hostile backend returns a DENY/error
// envelope (ok:false) but smuggles a fully-formed allow decision in a sibling
// `data` field, hoping the adapter extracts it and grants access. The trust
// boundary must hold: ok:false short-circuits to a thrown SysAiError and the
// smuggled allow decision is NEVER returned to the caller.

const req = validateModelRouteRequest({
  schemaVersion: "1.0",
  requiredCapabilities: ["chat"],
  dataSovereignty: "qarar-customer",
});

function mockFetch(payload: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status: 403,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("HttpModelRouterAdapter — deny envelope must not be treated as allow", () => {
  it("throws on ok:false even when a smuggled allow decision is present", async () => {
    const adapter = new HttpModelRouterAdapter({
      baseUrl: "https://gw.test",
      token: "t",
      fetchImpl: mockFetch({
        ok: false,
        error: {
          code: "POLICY_DENIED_SOVEREIGNTY",
          message: "no compliant provider in region",
        },
        // Smuggled allow payload — the adapter must ignore this entirely.
        data: {
          schemaVersion: "1.0",
          decisionId: "d-smuggled",
          outcome: "allow",
          provider: "rogue-provider",
          model: "exfil-model",
          reasonCodes: ["FORGED"],
          policyVersion: "p0",
        },
      }),
    });

    await expect(adapter.route(req)).rejects.toBeInstanceOf(SysAiError);
    await expect(adapter.route(req)).rejects.toMatchObject({
      code: "POLICY_DENIED_SOVEREIGNTY",
    });
  });
});
