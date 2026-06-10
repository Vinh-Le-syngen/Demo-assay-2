import { z } from "zod";

export const dialogModeSchema = z.enum([
  "debate", "council", "panel", "copilot", "review_loop", "self-consistency",
]);

export const dialogConfigSchema = z.object({
  schemaVersion: z.literal("1.0"),
  providerMode: z.enum(["live", "stub"]).default("stub"),
  maxTurns: z.number().int().min(1).max(50).default(12),
});

export const dialogRequestSchema = z.object({
  schemaVersion: z.literal("1.0"),
  mode: dialogModeSchema,
  topic: z.string().min(1),
  participants: z.array(z.string()).min(1),
  retrieval: z.object({ enabled: z.boolean(), query: z.string().optional() }).optional(),
  arbiter: z.object({ required: z.boolean(), humanId: z.string().optional() }).optional(),
  tenant: z.string().optional(),
  dataSovereignty: z.string().optional(),
});

export const turnSchema = z.object({
  index: z.number().int().min(0),
  participant: z.string(),
  text: z.string(),
  modelDecisionId: z.string().optional(),
});

export const dialogResultSchema = z.object({
  schemaVersion: z.literal("1.0"),
  dialogId: z.string(),
  mode: dialogModeSchema,
  transcript: z.array(turnSchema),
  contextPackId: z.string().optional(),
  status: z.enum(["completed", "awaiting_arbiter", "degraded", "error"]),
  arbiterRequired: z.boolean().optional(),
});

export type DialogMode = z.infer<typeof dialogModeSchema>;
export type DialogConfig = z.infer<typeof dialogConfigSchema>;
export type DialogRequest = z.infer<typeof dialogRequestSchema>;
export type DialogResult = z.infer<typeof dialogResultSchema>;

export function defineDialogConfig(config: unknown): DialogConfig {
  return dialogConfigSchema.parse(config);
}
export const validateDialogRequest = (v: unknown): DialogRequest =>
  dialogRequestSchema.parse(v);
export const validateDialogResult = (v: unknown): DialogResult =>
  dialogResultSchema.parse(v);
