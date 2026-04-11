import { runCodexStructuredOutput } from "@/lib/agent/codex-cli";
import type { TeamStructuredExecutor } from "@/lib/agent/executor";
import { CoderAgent } from "@/lib/team/roles/coder";
import { PlannerAgent } from "@/lib/team/roles/planner";
import { RequestTitleAgent } from "@/lib/team/roles/request-title";
import { ReviewerAgent } from "@/lib/team/roles/reviewer";

export type TeamRoleDependencies = {
  executor: TeamStructuredExecutor;
  requestTitleAgent: Pick<RequestTitleAgent, "run">;
  plannerAgent: Pick<PlannerAgent, "run">;
  coderAgent: Pick<CoderAgent, "run">;
  reviewerAgent: Pick<ReviewerAgent, "run">;
};

const createDefaultRoleAgents = (
  executor: TeamStructuredExecutor,
): Omit<TeamRoleDependencies, "executor"> => {
  return {
    requestTitleAgent: new RequestTitleAgent(executor),
    plannerAgent: new PlannerAgent(executor),
    coderAgent: new CoderAgent(executor),
    reviewerAgent: new ReviewerAgent(executor),
  };
};

export const resolveTeamRoleDependencies = (
  overrides: Partial<TeamRoleDependencies> = {},
): TeamRoleDependencies => {
  const executor = overrides.executor ?? runCodexStructuredOutput;

  return {
    executor,
    ...createDefaultRoleAgents(executor),
    ...overrides,
  };
};
