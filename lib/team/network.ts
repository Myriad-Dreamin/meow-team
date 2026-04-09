import { z } from "zod";
import { teamConfig } from "@/team.config";
import { applyHandoff, summarizeHandoffs } from "@/lib/team/agent-helpers";
import { runCodexStructuredOutput } from "@/lib/team/codex-cli";
import { createPlannerDispatchAssignment, ensurePendingDispatchWork } from "@/lib/team/dispatch";
import { appendTeamExecutionStep, getTeamThreadRecord, upsertTeamThreadRun } from "@/lib/team/history";
import { buildOpenSpecSkillReference, describeLocalOpenSpecSkills } from "@/lib/team/openspec";
import { loadRolePrompt } from "@/lib/team/prompts";
import { findConfiguredRepository } from "@/lib/team/repositories";
import type { TeamRepositoryOption } from "@/lib/team/repository-types";
import type { TeamExecutionStep, TeamRoleHandoff } from "@/lib/team/types";

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
  steps: TeamExecutionStep[];
};

const plannerTaskSchema = z.object({
  title: z.string().trim().min(1),
  objective: z.string().trim().min(1),
});

const plannerResponseSchema = z.object({
  handoff: z.object({
    summary: z.string().trim().min(1),
    deliverable: z.string().trim().min(1),
    decision: z.enum(["continue", "approved", "needs_revision"]),
  }),
  dispatch: z
    .object({
      planSummary: z.string().trim().min(1),
      plannerDeliverable: z.string().trim().min(1),
      branchPrefix: z.string().trim().min(1),
      tasks: z.array(plannerTaskSchema).min(1).max(teamConfig.dispatch.maxProposalCount),
    })
    .nullable(),
});

const plannerOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["handoff", "dispatch"],
  properties: {
    handoff: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "deliverable", "decision"],
      properties: {
        summary: {
          type: "string",
          minLength: 1,
        },
        deliverable: {
          type: "string",
          minLength: 1,
        },
        decision: {
          type: "string",
          enum: ["continue", "approved", "needs_revision"],
        },
      },
    },
    dispatch: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["planSummary", "plannerDeliverable", "branchPrefix", "tasks"],
      properties: {
        planSummary: {
          type: "string",
          minLength: 1,
        },
        plannerDeliverable: {
          type: "string",
          minLength: 1,
        },
        branchPrefix: {
          type: "string",
          minLength: 1,
        },
        tasks: {
          type: "array",
          minItems: 1,
          maxItems: teamConfig.dispatch.maxProposalCount,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "objective"],
            properties: {
              title: {
                type: "string",
                minLength: 1,
              },
              objective: {
                type: "string",
                minLength: 1,
              },
            },
          },
        },
      },
    },
  },
} as const;

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

const buildLocalSkillReference = (): string => {
  return [
    "Local repo skills:",
    "- `.codex/skills/team-harness-workflow/SKILL.md`",
    "- `.codex/skills/team-harness-workflow/references/planner.md`",
    "- `.codex/skills/team-harness-workflow/references/lanes.md`",
  ].join("\n");
};

const filterWorkflowHandoffs = (
  state: TeamRunState,
): Partial<Record<string, TeamRoleHandoff>> => {
  return Object.fromEntries(
    Object.entries(state.handoffs).filter(([roleId]) => state.workflow.includes(roleId)),
  );
};

const getOrderedHandoffs = (state: TeamRunState): TeamRoleHandoff[] => {
  return Object.values(filterWorkflowHandoffs(state))
    .filter((handoff): handoff is TeamRoleHandoff => Boolean(handoff))
    .sort((left, right) => left.sequence - right.sequence);
};

const buildPlannerPrompt = ({
  plannerPrompt,
  state,
}: {
  plannerPrompt: string;
  state: TeamRunState;
}): string => {
  const repositoryContext = state.selectedRepository
    ? `Selected repository: ${state.selectedRepository.name} at ${state.selectedRepository.path}.`
    : "Selected repository: none. Proposal dispatch is blocked until a repository is selected.";

  return [
    `You are Planner, the dispatch coordinator inside the ${state.teamName} engineering harness.`,
    `Owner: ${state.ownerName}.`,
    `Shared objective: ${state.objective}`,
    repositoryContext,
    `Configured workflow: ${state.workflow.join(" -> ")}`,
    `Current assignment number: ${state.assignmentNumber}.`,
    `Configured coding-review pool size: ${teamConfig.dispatch.workerCount}.`,
    `Planner proposals are separate from the coding-review pool. The planner can create one or more proposals, then approved proposals are scheduled onto the shared coder/reviewer pool.`,
    `Codex skill context:`,
    buildLocalSkillReference(),
    `OpenSpec context:`,
    describeLocalOpenSpecSkills(),
    buildOpenSpecSkillReference(),
    `Your role prompt is below:`,
    plannerPrompt.trim(),
    `Current handoffs for this assignment:`,
    summarizeHandoffs(state),
    `Rules:`,
    `- Create a practical engineering plan and split it into between 1 and ${teamConfig.dispatch.maxProposalCount} concrete proposals for the request group when a repository is selected.`,
    `- Keep proposals logical and implementation-focused. Do not describe them as tied to a specific branch or worker slot.`,
    `- Align each proposal with the local OpenSpec flow so the backend can materialize a real OpenSpec change for it.`,
    `- Use branchPrefix as a short, git-friendly theme for the request group.`,
    `- If no repository is selected, explain that dispatch is blocked and set dispatch to null.`,
    `Final response requirements:`,
    `- Return JSON that matches the provided schema exactly.`,
    `- Put the planner handoff in handoff.summary and handoff.deliverable.`,
    `- Set handoff.decision to "continue".`,
    `- If dispatch is possible, fill dispatch.planSummary, dispatch.plannerDeliverable, dispatch.branchPrefix, and dispatch.tasks.`,
  ].join("\n\n");
};

const createPlannerStep = ({
  agentName,
  deliverable,
}: {
  agentName: string;
  deliverable: string;
}): TeamExecutionStep => {
  return {
    agentName,
    createdAt: new Date().toISOString(),
    text: deliverable,
  };
};

const buildRunState = ({
  input,
  reset,
  selectedRepository,
  existingThread,
}: {
  input: string;
  reset: boolean;
  selectedRepository: TeamRepositoryOption | null;
  existingThread: Awaited<ReturnType<typeof getTeamThreadRecord>>;
}): TeamRunState => {
  const baseState = buildInitialState(reset, selectedRepository);
  if (!existingThread) {
    return {
      ...baseState,
      latestInput: input,
      forceReset: false,
    };
  }

  const storedData = existingThread.data;
  const shouldResetAssignment =
    reset ||
    storedData.latestInput !== input ||
    (storedData.selectedRepository?.id ?? null) !== (selectedRepository?.id ?? null);

  return {
    ...baseState,
    assignmentNumber: shouldResetAssignment
      ? (storedData.assignmentNumber ?? 0) + 1
      : storedData.assignmentNumber,
    latestInput: input,
    handoffCounter: shouldResetAssignment ? 0 : storedData.handoffCounter,
    handoffs: shouldResetAssignment ? {} : filterWorkflowHandoffs(storedData),
    forceReset: false,
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
  const selectedRepository = await findConfiguredRepository(teamConfig, repositoryId);

  if (repositoryId && !selectedRepository) {
    throw new Error(
      "Selected repository is not available. Only repositories discovered from directories listed in team.config.ts can be used.",
    );
  }

  const resolvedThreadId = threadId ?? crypto.randomUUID();
  const existingThread = await getTeamThreadRecord(teamConfig.storage.threadFile, resolvedThreadId);
  const state = buildRunState({
    input,
    reset: Boolean(reset),
    selectedRepository,
    existingThread,
  });

  await upsertTeamThreadRun({
    threadFile: teamConfig.storage.threadFile,
    threadId: resolvedThreadId,
    state,
    input,
  });

  const plannerRole = await loadRolePrompt("planner");
  const plannerResponse = await runCodexStructuredOutput({
    worktreePath: selectedRepository?.path ?? process.cwd(),
    prompt: buildPlannerPrompt({
      plannerPrompt: plannerRole.prompt,
      state,
    }),
    responseSchema: plannerResponseSchema,
    outputJsonSchema: plannerOutputJsonSchema,
    codexHomePrefix: "planner",
  });

  applyHandoff({
    state,
    role: plannerRole,
    summary: plannerResponse.handoff.summary,
    deliverable: plannerResponse.handoff.deliverable,
    decision: plannerResponse.handoff.decision,
  });

  if (!selectedRepository && plannerResponse.dispatch) {
    throw new Error("Planner produced dispatch proposals without a selected repository.");
  }

  if (selectedRepository && !plannerResponse.dispatch) {
    throw new Error("Planner completed without dispatch proposals.");
  }

  if (selectedRepository && plannerResponse.dispatch) {
    await createPlannerDispatchAssignment({
      threadId: resolvedThreadId,
      assignmentNumber: state.assignmentNumber,
      repository: selectedRepository,
      plannerSummary: plannerResponse.dispatch.planSummary,
      plannerDeliverable: plannerResponse.dispatch.plannerDeliverable,
      branchPrefix: plannerResponse.dispatch.branchPrefix,
      tasks: plannerResponse.dispatch.tasks,
    });
  }

  const step = createPlannerStep({
    agentName: plannerRole.name,
    deliverable: plannerResponse.handoff.deliverable,
  });
  await appendTeamExecutionStep({
    threadFile: teamConfig.storage.threadFile,
    threadId: resolvedThreadId,
    state,
    step,
  });

  void ensurePendingDispatchWork({
    threadId: resolvedThreadId,
  });

  return {
    threadId: resolvedThreadId,
    assignmentNumber: state.assignmentNumber,
    approved: false,
    repository: selectedRepository,
    workflow: state.workflow,
    handoffs: getOrderedHandoffs(state),
    steps: [step],
  };
};
