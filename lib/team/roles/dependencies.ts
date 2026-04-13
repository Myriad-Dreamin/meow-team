import { teamConfig } from "@/team.config";
import { runCodexStructuredOutput } from "@/lib/agent/codex-cli";
import {
  createQueuedTeamStructuredExecutor,
  type TeamStructuredExecutor,
} from "@/lib/agent/executor";
import { CoderAgent } from "@/lib/team/roles/coder";
import { OpenSpecMaterializerAgent } from "@/lib/team/roles/openspec-materializer";
import { PlannerAgent } from "@/lib/team/roles/planner";
import { RequestTitleAgent } from "@/lib/team/roles/request-title";
import { ReviewerAgent } from "@/lib/team/roles/reviewer";

export type TeamRoleDependencies = {
  executor: TeamStructuredExecutor;
  requestTitleAgent: Pick<RequestTitleAgent, "run">;
  plannerAgent: Pick<PlannerAgent, "run">;
  openSpecMaterializerAgent: Pick<OpenSpecMaterializerAgent, "run">;
  coderAgent: Pick<CoderAgent, "run">;
  reviewerAgent: Pick<ReviewerAgent, "run">;
};

const defaultQueuedExecutor = createQueuedTeamStructuredExecutor({
  executor: runCodexStructuredOutput,
  concurrency: teamConfig.dispatch.workerCount,
});

const createDefaultRoleAgents = (
  executor: TeamStructuredExecutor,
): Omit<TeamRoleDependencies, "executor"> => {
  return {
    requestTitleAgent: new RequestTitleAgent(executor),
    plannerAgent: new PlannerAgent(executor),
    openSpecMaterializerAgent: new OpenSpecMaterializerAgent(executor),
    coderAgent: new CoderAgent(executor),
    reviewerAgent: new ReviewerAgent(executor),
  };
};

export const resolveTeamRoleDependencies = (
  overrides: Partial<TeamRoleDependencies> = {},
): TeamRoleDependencies => {
  const executor = overrides.executor ?? defaultQueuedExecutor;

  return {
    executor,
    ...createDefaultRoleAgents(executor),
    ...overrides,
  };
};
