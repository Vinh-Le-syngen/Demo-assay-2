import { z } from "zod";

const CAPABILITY = z.enum([
  "chat", "tools", "vision", "long-context", "embedding", "json-mode",
]);
const COST = z.enum(["low", "medium", "high"]);

export const providerCapabilitySchema = z.object({
  provider: z.string(),
  model: z.string(),
  capabilities: z.array(CAPABILITY),
  costClass: COST.optional(),
  sovereignty: z.array(z.string()).optional(),
  status: z.enum(["active", "deprecated", "disabled"]).default("active"),
});

export const modelRouterConfigSchema = z.object({
  schemaVersion: z.literal("1.0"),
  providers: z.array(providerCapabilitySchema).min(1),
  defaultFallbackChain: z.array(z.string()).optional(),
});

export const modelRouteRequestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  requiredCapabilities: z.array(z.string()).min(1),
  allowedProviders: z.array(z.string()).optional(),
  dataSovereignty: z.string().optional(),
  maxCostClass: COST.optional(),
  tenant: z.string().optional(),
  journeyId: z.string().optional(),
});

export const modelRouteDecisionSchema = z.object({
  schemaVersion: z.literal("1.0"),
  decisionId: z.string(),
  outcome: z.enum(["allow", "deny"]),
  provider: z.string().optional(),
  model: z.string().optional(),
  fallbackChain: z.array(z.string()).optional(),
  reasonCodes: z.array(z.string()),
  estCostClass: COST.optional(),
  policyVersion: z.string(),
});

export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;
export type ModelRouterConfig = z.infer<typeof modelRouterConfigSchema>;
export type ModelRouteRequest = z.infer<typeof modelRouteRequestSchema>;
export type ModelRouteDecision = z.infer<typeof modelRouteDecisionSchema>;

/** Validate + normalize the router config (the composition root). */
export function defineModelRouterConfig(config: unknown): ModelRouterConfig {
  return modelRouterConfigSchema.parse(config);
}
export const validateModelRouteRequest = (v: unknown): ModelRouteRequest =>
  modelRouteRequestSchema.parse(v);
export const validateModelRouteDecision = (v: unknown): ModelRouteDecision =>
  modelRouteDecisionSchema.parse(v);
