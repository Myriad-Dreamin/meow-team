import { z } from "zod";

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

export const teamRepositoryOptionSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  rootId: z.string().trim().min(1),
  rootLabel: z.string().trim().min(1),
  path: z.string().trim().min(1),
  relativePath: z.string().trim().min(1),
});

export const rolePromptSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  summary: z.string(),
  prompt: z.string().trim().min(1),
  filePath: z.string().trim().min(1),
});
