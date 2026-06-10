import { describe, it, expect } from "vitest";
import {
  defineRagConfig,
  validateRetrievalRequest,
  validateContextPack,
} from "../src/schema.js";

// unit / pure — context-pack & request validation/shaping, no IO.
describe("rag schema validation (pure)", () => {
  it("applies defaults when shaping a retrieval request", () => {
    const req = validateRetrievalRequest({ schemaVersion: "1.0", query: "policy" });
    // topK and citationRequired carry their schema defaults.
    expect(req.topK).toBe(8);
    expect(req.citationRequired).toBe(true);
    expect(req.query).toBe("policy");
  });

  it("defaults a rag config to citationRequired", () => {
    const cfg = defineRagConfig({ schemaVersion: "1.0", instance: "gw" });
    expect(cfg.citationRequired).toBe(true);
    expect(cfg.instance).toBe("gw");
  });

  it("accepts a fully-cited pack and preserves optional staleness", () => {
    const pack = validateContextPack(
      {
        schemaVersion: "1.0",
        contextPackId: "cp",
        query: "q",
        snippets: [{ text: "t", sourceId: "s1", citation: "canon#1", score: 0.9 }],
        staleness: [{ sourceId: "s1", reason: "older than 90d" }],
      },
      true,
    );
    expect(pack.snippets[0].score).toBe(0.9);
    expect(pack.staleness?.[0].reason).toBe("older than 90d");
  });

  it("skips the citation requirement when citationRequired is false", () => {
    const pack = validateContextPack(
      {
        schemaVersion: "1.0",
        contextPackId: "cp",
        query: "q",
        snippets: [{ text: "t", sourceId: "s1", citation: "" }],
      },
      false,
    );
    // Shape is valid; missing citation is tolerated because the policy is off.
    expect(pack.snippets).toHaveLength(1);
  });
});
