import { z } from "zod";

const roleIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9-]+$/, "Role IDs must use lowercase letters, numbers, and dashes only.");

export const teamConfigSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  owner: z.object({
    name: z.string().trim().min(1),
    objective: z.string().trim().min(1),
  }),
  model: z.object({
    provider: z.literal("openai"),
    model: z.string().trim().min(1),
    reasoningEffort: z.enum(["minimal", "low", "medium", "high", "xhigh"]),
    textVerbosity: z.enum(["low", "medium", "high"]),
    maxOutputTokens: z.number().int().positive(),
  }),
  workflow: z.array(roleIdSchema).min(1),
  maxIterations: z.number().int().positive(),
  storage: z.object({
    threadFile: z.string().trim().min(1),
  }),
});

export type TeamConfig = z.infer<typeof teamConfigSchema>;

export const defineTeamConfig = (input: TeamConfig): TeamConfig => {
  return teamConfigSchema.parse(input);
};
