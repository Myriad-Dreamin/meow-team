import { z } from "zod";

export const teamRoleDecisionSchema = z.enum(["continue", "approved", "needs_revision"]);
