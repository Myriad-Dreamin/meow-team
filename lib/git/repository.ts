import { z } from "zod";
import { worktreeSchema } from "@/lib/team/coding/worktree";

export const teamRepositoryOptionSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  rootId: z.string().trim().min(1),
  rootLabel: z.string().trim().min(1),
  path: z.string().trim().min(1),
  relativePath: z.string().trim().min(1),
});

export type TeamRepositoryOption = z.infer<typeof teamRepositoryOptionSchema>;

export const teamRepositoryContextSchema = z.object({
  repository: teamRepositoryOptionSchema,
  branchName: z.string().trim().min(1),
  baseBranch: z.string().trim().min(1),
  worktree: worktreeSchema,
  implementationCommit: z.string().trim().min(1).nullable(),
});

export type TeamRepositoryContext = z.infer<typeof teamRepositoryContextSchema>;
