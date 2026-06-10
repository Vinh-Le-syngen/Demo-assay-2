import { describe, it, expect } from "vitest";
import { HttpModelRouterAdapter, SysAiError } from "../src/adapter.js";
import { validateModelRouteRequest } from "../src/schema.js";

// negative / kind: authz — the backend rejects the bearer token with an error
// envelope (401). The adapter must surface this as a typed SysAiError that
// preserves the backend's code/message/details, not as an opaque throw or a
// fabricated allow decision.

const req = validateModelRouteRequest({
  schemaVersion: "1.0",
  requiredCapabilities: ["chat"],
});

function mockFetch(payload: unknown, status: number): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("HttpModelRouterAdapter — authz error envelope", () => {
  it("maps an auth error envelope to a typed SysAiError", async () => {
    const adapter = new HttpModelRouterAdapter({
      baseUrl: "https://gw.test",
      token: "bad-token",
      fetchImpl: mockFetch(
        {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "invalid bearer token",
            details: { hint: "token expired" },
          },
        },
        401,
      ),
    });

    await expect(adapter.route(req)).rejects.toBeInstanceOf(SysAiError);
    await expect(adapter.route(req)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "invalid bearer token",
      details: { hint: "token expired" },
    });
  });
});
