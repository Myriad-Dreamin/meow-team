import { z } from "zod";

const roleIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9-]+$/, "Role IDs must use lowercase letters, numbers, and dashes only.");

const repositoryRootIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(
    /^[a-z0-9-]+$/,
    "Repository root IDs must use lowercase letters, numbers, and dashes only.",
  );

const repositoryRootSchema = z.object({
  id: repositoryRootIdSchema,
  label: z.string().trim().min(1),
  directory: z.string().trim().min(1),
});

const dispatchConfigSchema = z.object({
  workerCount: z.number().int().positive(),
  maxProposalCount: z.number().int().positive(),
  branchPrefix: z.string().trim().min(1),
  baseBranch: z.string().trim().min(1),
  worktreeRoot: z.string().trim().min(1),
});

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
  dispatch: dispatchConfigSchema,
  repositories: z
    .object({
      roots: z
        .array(repositoryRootSchema)
        .min(1)
        .refine(
          (roots) => new Set(roots.map((root) => root.id)).size === roots.length,
          "Repository root IDs must be unique.",
        ),
    })
    .optional(),
});

export type TeamConfig = z.infer<typeof teamConfigSchema>;

export const defineTeamConfig = (input: TeamConfig): TeamConfig => {
  return teamConfigSchema.parse(input);
};
