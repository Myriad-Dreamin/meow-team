import { createAgent, createNetwork, createState, createTool } from "@inngest/agent-kit";
import { z } from "zod";
import { teamConfig } from "@/team.config";
import { createSaveHandoffTool, formatTextMessage, summarizeHandoffs } from "@/lib/team/agent-helpers";
import { createPlannerDispatchAssignment, ensurePendingDispatchWork } from "@/lib/team/dispatch";
import { createTeamHistory } from "@/lib/team/history";
import { createTeamModel, ensureOpenAiApiKey } from "@/lib/team/model";
import { buildOpenSpecSkillReference, describeLocalOpenSpecSkills } from "@/lib/team/openspec";
import { loadRolePrompt } from "@/lib/team/prompts";
import { findConfiguredRepository } from "@/lib/team/repositories";
import type { TeamRepositoryOption } from "@/lib/team/repository-types";
import type { TeamRoleHandoff } from "@/lib/team/types";

export type TeamRunState = {
  teamId: string;
  teamName: string;
  ownerName: string;
  objective: string;
  selectedRepository: TeamRepositoryOption | null;
  workflow: string[];
  handoffs: Partial<Record<string, TeamRoleHandoff>>;
  handoffCounter: number;
  assignmentNumber: number;
  latestInput: string | null;
  forceReset: boolean;
};

export type TeamRunSummary = {
  threadId: string | null;
  assignmentNumber: number;
  approved: boolean;
  repository: TeamRepositoryOption | null;
  workflow: string[];
  handoffs: TeamRoleHandoff[];
  steps: Array<{
    agentName: string;
    createdAt: string;
    text: string;
  }>;
};

const buildInitialState = (
  forceReset: boolean,
  selectedRepository: TeamRepositoryOption | null,
): TeamRunState => {
  return {
    teamId: teamConfig.id,
    teamName: teamConfig.name,
    ownerName: teamConfig.owner.name,
    objective: teamConfig.owner.objective,
    selectedRepository,
    workflow: teamConfig.workflow,
    handoffs: {},
    handoffCounter: 0,
    assignmentNumber: 1,
    latestInput: null,
    forceReset,
  };
};

const createPlannerDispatchTool = () => {
  return createTool({
    name: "dispatch_parallel_work",
    description:
      "Register multiple planner proposals for the current request. Human approval is required before any coding-review lane starts.",
    parameters: z.object({
      planSummary: z.string().trim().min(1),
      plannerDeliverable: z.string().trim().min(1),
      branchPrefix: z.string().trim().min(1),
      tasks: z
        .array(
          z.object({
            title: z.string().trim().min(1),
            objective: z.string().trim().min(1),
          }),
        )
        .min(1)
        .max(teamConfig.dispatch.workerCount),
    }),
    handler: async ({ planSummary, plannerDeliverable, branchPrefix, tasks }, { network }) => {
      const state = network.state.data;
      const threadId = network.state.threadId;

      if (!threadId) {
        throw new Error("Planner dispatch requires a thread ID.");
      }

      const assignment = await createPlannerDispatchAssignment({
        threadId,
        assignmentNumber: state.assignmentNumber,
        repository: state.selectedRepository,
        plannerSummary: planSummary,
        plannerDeliverable,
        branchPrefix,
        tasks,
      });

      return {
        ok: true,
        assignmentNumber: assignment.assignmentNumber,
        workerCount: assignment.workerCount,
        taskCount: tasks.length,
      };
    },
  });
};

const createPlannerSystemPrompt = (prompt: string) => {
  return async ({ network }: { network?: { state: { data: TeamRunState } } }) => {
    const state = network?.state.data ?? buildInitialState(false, null);
    const repositoryContext = state.selectedRepository
      ? `Selected repository: ${state.selectedRepository.name} at ${state.selectedRepository.path}.`
      : "Selected repository: none. Parallel dispatch requires a selected repository.";

    return [
      `You are Planner, the dispatch coordinator inside the ${state.teamName} engineering harness.`,
      `Owner: ${state.ownerName}.`,
      `Shared objective: ${state.objective}`,
      repositoryContext,
      `Configured workflow: ${state.workflow.join(" -> ")}`,
      `Current assignment number: ${state.assignmentNumber}.`,
      `Configured background lanes: ${teamConfig.dispatch.workerCount} coder+reviewer pairs.`,
      `Each proposal gets its own canonical branch namespace, dedicated worktree path, and coding-review lifecycle once a human approves it.`,
      `OpenSpec context:`,
      describeLocalOpenSpecSkills(),
      buildOpenSpecSkillReference(),
      `Your role prompt is below:`,
      prompt.trim(),
      `Current handoffs for this assignment:`,
      summarizeHandoffs(state),
      `Rules:`,
      `- Create a practical engineering plan and split it into between 1 and ${teamConfig.dispatch.workerCount} concrete proposals for the request group.`,
      `- Call dispatch_parallel_work exactly once to persist those proposals, then stop. Do not assume coding starts before a human approves a proposal.`,
      `- Align each proposal with the local OpenSpec flow so the backend can materialize a real OpenSpec change for it.`,
      `- Each proposal title should be concise and stable enough to become part of an OpenSpec change name.`,
      `- Use branchPrefix as a short, git-friendly theme for the request group. The backend creates a canonical branch namespace plus per-proposal branch names and reusable worktrees.`,
      `- Always call save_handoff exactly once when you are done planning.`,
      `- If no repository is selected, explain that dispatch is blocked and do not invent repository operations.`,
    ].join("\n\n");
  };
};

export const getTeamRuntime = async () => {
  ensureOpenAiApiKey();
  const teamModel = createTeamModel();
  const plannerRole = await loadRolePrompt("planner");
  const plannerAgent = createAgent<TeamRunState>({
    name: plannerRole.id,
    description: plannerRole.summary,
    system: createPlannerSystemPrompt(plannerRole.prompt),
    tools: [createPlannerDispatchTool(), createSaveHandoffTool<TeamRunState>(plannerRole)],
    model: teamModel,
  });

  const network = createNetwork<TeamRunState>({
    name: teamConfig.name,
    description: `${teamConfig.owner.objective} Dispatch planning happens here; coder and reviewer lanes continue in the background.`,
    agents: [plannerAgent],
    defaultModel: teamModel,
    maxIter: 2,
    history: createTeamHistory(teamConfig.storage.threadFile),
    router: async ({ network: currentNetwork }) => {
      return currentNetwork.state.results.length === 0
        ? currentNetwork.agents.get(plannerRole.id)
        : undefined;
    },
  });

  return {
    config: teamConfig,
    network,
  };
};

export const runTeam = async ({
  input,
  threadId,
  repositoryId,
  reset,
}: {
  input: string;
  threadId?: string;
  repositoryId?: string;
  reset?: boolean;
}): Promise<TeamRunSummary> => {
  const runtime = await getTeamRuntime();
  const selectedRepository = await findConfiguredRepository(teamConfig, repositoryId);

  if (repositoryId && !selectedRepository) {
    throw new Error(
      "Selected repository is not available. Only repositories discovered from directories listed in team.config.ts can be used.",
    );
  }

  const state = createState(buildInitialState(Boolean(reset), selectedRepository), {
    threadId,
  });
  const run = await runtime.network.run(input, { state });

  void ensurePendingDispatchWork({
    threadId: run.state.threadId ?? undefined,
  });

  const handoffs = runtime.config.workflow
    .map((roleId) => run.state.data.handoffs[roleId])
    .filter((handoff): handoff is TeamRoleHandoff => Boolean(handoff));

  const steps = run.state.results.map((result) => {
    return {
      agentName: result.agentName,
      createdAt: result.createdAt.toISOString(),
      text: result.output.map((message) => formatTextMessage(message)).filter(Boolean).join("\n\n"),
    };
  });

  return {
    threadId: run.state.threadId ?? null,
    assignmentNumber: run.state.data.assignmentNumber,
    approved: false,
    repository: run.state.data.selectedRepository,
    workflow: runtime.config.workflow,
    handoffs,
    steps,
  };
};
