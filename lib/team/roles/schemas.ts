import { z } from "zod";
export { teamRepositoryOptionSchema } from "@/lib/git/repository";
import {
  CONVENTIONAL_TITLE_SCOPE_PATTERN,
  CONVENTIONAL_TITLE_TYPES,
} from "@/lib/team/request-title";

export const teamRoleDecisionSchema = z.enum(["continue", "approved", "needs_revision"]);

export const teamRoleHandoffSchema = z.object({
  roleId: z.string().trim().min(1),
  roleName: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  deliverable: z.string().trim().min(1),
  decision: teamRoleDecisionSchema,
  sequence: z.number().int().positive(),
  assignmentNumber: z.number().int().positive(),
  updatedAt: z.string().trim().min(1),
});

export const teamConventionalTitleSchema = z.object({
  type: z.enum(CONVENTIONAL_TITLE_TYPES),
  scope: z.string().trim().regex(CONVENTIONAL_TITLE_SCOPE_PATTERN).nullable(),
});

export const rolePromptSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  summary: z.string(),
  prompt: z.string().trim().min(1),
  filePath: z.string().trim().min(1),
});
