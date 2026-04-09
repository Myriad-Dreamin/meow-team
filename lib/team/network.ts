import {
  createAgent,
  createNetwork,
  createState,
  createTool,
  openai,
  type Message,
} from "@inngest/agent-kit";
import { z } from "zod";
import { teamConfig } from "@/team.config";
import { createTeamHistory } from "@/lib/team/history";
import { loadWorkflowRolePrompts, type RolePrompt } from "@/lib/team/prompts";
import { findConfiguredRepository } from "@/lib/team/repositories";
import type { TeamRepositoryOption } from "@/lib/team/repository-types";
import { missingOpenAiConfigMessage, teamRuntimeConfig } from "@/lib/team/runtime-config";

export type TeamRoleDecision = "continue" | "approved" | "needs_revision";

export type TeamRoleHandoff = {
  roleId: string;
  roleName: string;
  summary: string;
  deliverable: string;
  decision: TeamRoleDecision;
  sequence: number;
  assignmentNumber: number;
  updatedAt: string;
};

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

const createTeamModel = () => {
  // AgentKit 0.13.2 does not understand the newer "openai-responses" adapter
  // format yet, so use the compatible OpenAI chat adapter until upstream
  // support lands.
  return openai({
    model: teamConfig.model.model,
    apiKey: teamRuntimeConfig.apiKey ?? undefined,
    baseUrl: teamRuntimeConfig.baseUrl,
    defaultParameters: {
      store: false,
      max_completion_tokens: teamConfig.model.maxOutputTokens,
    },
  });
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

const formatTextMessage = (message: Message): string => {
  if (message.type !== "text") {
    return "";
  }

  if (typeof message.content === "string") {
    return message.content;
  }

  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
};

const summarizeHandoffs = (state: TeamRunState): string => {
  const orderedHandoffs = state.workflow
    .map((roleId) => state.handoffs[roleId])
    .filter((handoff): handoff is TeamRoleHandoff => Boolean(handoff));

  if (orderedHandoffs.length === 0) {
    return "No previous role handoffs exist for this assignment yet.";
  }

  return orderedHandoffs
    .map((handoff) => {
      return [
        `${handoff.roleName} (${handoff.roleId})`,
        `Decision: ${handoff.decision}`,
        `Summary: ${handoff.summary}`,
        `Deliverable: ${handoff.deliverable}`,
      ].join("\n");
    })
    .join("\n\n");
};

const normalizeDecision = (
  roleId: string,
  proposedDecision: TeamRoleDecision,
): TeamRoleDecision => {
  if (roleId === "reviewer") {
    return proposedDecision === "continue" ? "approved" : proposedDecision;
  }
  return "continue";
};

const createSaveHandoffTool = (role: RolePrompt) => {
  return createTool({
    name: "save_handoff",
    description: "Persist this role's handoff for the next step in the engineering workflow.",
    parameters: z.object({
      summary: z.string().trim().min(1),
      deliverable: z.string().trim().min(1),
      decision: z.enum(["continue", "approved", "needs_revision"]).default("continue"),
    }),
    handler: async ({ summary, deliverable, decision }, { network }) => {
      const state = network.state.data;
      const sequence = state.handoffCounter + 1;
      const normalizedDecision = normalizeDecision(role.id, decision);

      state.handoffCounter = sequence;
      state.handoffs = {
        ...state.handoffs,
        [role.id]: {
          roleId: role.id,
          roleName: role.name,
          summary,
          deliverable,
          decision: normalizedDecision,
          sequence,
          assignmentNumber: state.assignmentNumber,
          updatedAt: new Date().toISOString(),
        },
      };

      return {
        ok: true,
        roleId: role.id,
        decision: normalizedDecision,
        sequence,
      };
    },
  });
};

const createRoleSystemPrompt = (role: RolePrompt) => {
  return async ({ network }: { network?: { state: { data: TeamRunState } } }) => {
    const state = network?.state.data ?? buildInitialState(false, null);
    const repositoryContext = state.selectedRepository
      ? `Selected repository: ${state.selectedRepository.name} at ${state.selectedRepository.path}.`
      : "Selected repository: none.";

    return [
      `You are ${role.name}, a role inside the ${state.teamName} engineering harness.`,
      `Owner: ${state.ownerName}.`,
      `Shared objective: ${state.objective}`,
      repositoryContext,
      `Workflow order: ${state.workflow.join(" -> ")}`,
      `Current assignment number: ${state.assignmentNumber}.`,
      `Your role prompt is below:`,
      role.prompt.trim(),
      `Current handoffs for this assignment:`,
      summarizeHandoffs(state),
      `Rules:`,
      `- Focus only on your role.`,
      `- Read previous handoffs before acting.`,
      `- Always call save_handoff exactly once when you are ready to hand off.`,
      `- Put the concise executive summary in summary and the substantive output in deliverable.`,
      role.id === "reviewer"
        ? `- As reviewer, set decision to approved when the work is ready, or needs_revision when the coder should revise it.`
        : `- As ${role.id}, always leave decision as continue.`,
    ].join("\n\n");
  };
};

const resolveNextRoleId = (state: TeamRunState): string | undefined => {
  for (let index = 0; index < state.workflow.length; index += 1) {
    const roleId = state.workflow[index];
    const current = state.handoffs[roleId];

    if (index === 0) {
      if (!current) {
        return roleId;
      }
      continue;
    }

    const previousRoleId = state.workflow[index - 1];
    const previous = state.handoffs[previousRoleId];

    if (!previous) {
      return previousRoleId;
    }

    if (!current || current.sequence < previous.sequence) {
      return roleId;
    }
  }

  const finalRoleId = state.workflow.at(-1);
  if (!finalRoleId) {
    return undefined;
  }

  const finalHandoff = state.handoffs[finalRoleId];
  if (!finalHandoff) {
    return undefined;
  }

  if (finalHandoff.decision === "needs_revision" && state.workflow.length > 1) {
    const revisionRoleId = state.workflow[state.workflow.length - 2];
    const revisionHandoff = state.handoffs[revisionRoleId];

    if (!revisionHandoff || revisionHandoff.sequence <= finalHandoff.sequence) {
      return revisionRoleId;
    }
  }

  return undefined;
};

const ensureOpenAiApiKey = (): void => {
  if (!teamRuntimeConfig.apiKey) {
    throw new Error(missingOpenAiConfigMessage);
  }
};

export const getTeamRuntime = async () => {
  ensureOpenAiApiKey();
  const teamModel = createTeamModel();

  const roles = await loadWorkflowRolePrompts(teamConfig);
  const agents = roles.map((role) => {
    return createAgent<TeamRunState>({
      name: role.id,
      description: role.summary,
      system: createRoleSystemPrompt(role),
      tools: [createSaveHandoffTool(role)],
      model: teamModel,
    });
  });

  const network = createNetwork<TeamRunState>({
    name: teamConfig.name,
    description: teamConfig.owner.objective,
    agents,
    defaultModel: teamModel,
    maxIter: teamConfig.maxIterations,
    history: createTeamHistory(teamConfig.storage.threadFile),
    router: async ({ network }) => {
      const nextRoleId = resolveNextRoleId(network.state.data);
      return nextRoleId ? network.agents.get(nextRoleId) : undefined;
    },
  });

  return {
    config: teamConfig,
    roles,
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
    approved: handoffs.at(-1)?.decision === "approved",
    repository: run.state.data.selectedRepository,
    workflow: runtime.config.workflow,
    handoffs,
    steps,
  };
};
