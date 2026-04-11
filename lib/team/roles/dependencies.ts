import { runCodexStructuredOutput } from "@/lib/team/agent/codex-cli";
import type { TeamStructuredExecutor } from "@/lib/team/agent/executor";
import { runCoderRole } from "@/lib/team/roles/coder";
import { runPlannerRole } from "@/lib/team/roles/planner";
import { runRequestTitleRole } from "@/lib/team/roles/request-title";
import { runReviewerRole } from "@/lib/team/roles/reviewer";

export type TeamRoleDependencies = {
  executor: TeamStructuredExecutor;
  requestTitleRole: typeof runRequestTitleRole;
  plannerRole: typeof runPlannerRole;
  coderRole: typeof runCoderRole;
  reviewerRole: typeof runReviewerRole;
};

export const defaultTeamRoleDependencies: TeamRoleDependencies = {
  executor: runCodexStructuredOutput,
  requestTitleRole: runRequestTitleRole,
  plannerRole: runPlannerRole,
  coderRole: runCoderRole,
  reviewerRole: runReviewerRole,
};

export const resolveTeamRoleDependencies = (
  overrides: Partial<TeamRoleDependencies> = {},
): TeamRoleDependencies => {
  return {
    ...defaultTeamRoleDependencies,
    ...overrides,
  };
};
