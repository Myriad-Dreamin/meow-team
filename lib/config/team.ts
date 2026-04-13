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

const notificationTargetSchema = z.enum(["browser", "vscode"]);

const notificationsConfigSchema = z
  .object({
    target: notificationTargetSchema.default("browser"),
  })
  .default({
    target: "browser",
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
  storage: z.object({
    threadFile: z.string().trim().min(1),
  }),
  dispatch: dispatchConfigSchema,
  notifications: notificationsConfigSchema,
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

export type TeamConfigInput = z.input<typeof teamConfigSchema>;
export type TeamConfig = z.output<typeof teamConfigSchema>;
export type TeamNotificationTarget = z.infer<typeof notificationTargetSchema>;

export const defineTeamConfig = (input: TeamConfigInput): TeamConfig => {
  return teamConfigSchema.parse(input);
};
