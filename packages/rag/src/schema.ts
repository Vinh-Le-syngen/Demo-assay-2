import { z } from "zod";

export const ragConfigSchema = z.object({
  schemaVersion: z.literal("1.0"),
  instance: z.string(),
  citationRequired: z.boolean().default(true),
  defaultScope: z.array(z.string()).optional(),
});

export const retrievalRequestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  query: z.string().min(1),
  scope: z.array(z.string()).optional(),
  topK: z.number().int().min(1).max(50).default(8),
  citationRequired: z.boolean().default(true),
  dataSovereignty: z.string().optional(),
  tenant: z.string().optional(),
});

export const citationSchema = z.object({
  sourceId: z.string(),
  citation: z.string(),
  uri: z.string().optional(),
});

export const snippetSchema = z.object({
  text: z.string(),
  sourceId: z.string(),
  citation: z.string(),
  score: z.number().optional(),
});

export const contextPackSchema = z.object({
  schemaVersion: z.literal("1.0"),
  contextPackId: z.string(),
  query: z.string(),
  snippets: z.array(snippetSchema),
  citations: z.array(citationSchema).optional(),
  staleness: z
    .array(z.object({ sourceId: z.string(), reason: z.string() }))
    .optional(),
});

export type RagConfig = z.infer<typeof ragConfigSchema>;
export type RetrievalRequest = z.infer<typeof retrievalRequestSchema>;
export type ContextPack = z.infer<typeof contextPackSchema>;

export function defineRagConfig(config: unknown): RagConfig {
  return ragConfigSchema.parse(config);
}
export const validateRetrievalRequest = (v: unknown): RetrievalRequest =>
  retrievalRequestSchema.parse(v);

/** Validate a context pack; enforce citations when required. */
export function validateContextPack(v: unknown, citationRequired = true): ContextPack {
  const pack = contextPackSchema.parse(v);
  if (citationRequired) {
    const missing = pack.snippets.filter((s) => !s.citation || s.citation.trim() === "");
    if (missing.length > 0) {
      throw new Error(`context pack has ${missing.length} snippet(s) missing citations`);
    }
  }
  return pack;
}
