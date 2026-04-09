import { z } from "zod";
import { teamConfig } from "@/team.config";
import { applyHandoff, summarizeHandoffs } from "@/lib/team/agent-helpers";
import { runCodexStructuredOutput } from "@/lib/team/codex-cli";
import { createPlannerDispatchAssignment, ensurePendingDispatchWork } from "@/lib/team/dispatch";
import { ExistingBranchesRequireDeleteError } from "@/lib/team/git";
import {
  appendTeamExecutionStep,
  getTeamThreadRecord,
  updateTeamThreadRecord,
  upsertTeamThreadRun,
} from "@/lib/team/history";
import { appendTeamCodexLogEvent } from "@/lib/team/logs";
import { buildOpenSpecSkillReference, describeLocalOpenSpecSkills } from "@/lib/team/openspec";
import { loadRolePrompt } from "@/lib/team/prompts";
import {
  buildDeterministicRequestTitle,
  normalizeRequestTitle,
} from "@/lib/team/request-title";
import { findConfiguredRepository } from "@/lib/team/repositories";
import type { TeamRepositoryOption } from "@/lib/team/repository-types";
import type { TeamCodexEvent, TeamCodexLogEntry, TeamExecutionStep, TeamRoleHandoff } from "@/lib/team/types";

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
  requestTitle: string | null;
  requestText: string | null;
  latestInput: string | null;
  forceReset: boolean;
};

export type TeamRunSummary = {
  threadId: string | null;
  assignmentNumber: number;
  requestTitle: string;
  requestText: string;
  approved: boolean;
  repository: TeamRepositoryOption | null;
  workflow: string[];
  handoffs: TeamRoleHandoff[];
  steps: TeamExecutionStep[];
};

type ResolvedRequestMetadata = {
  requestTitle: string;
  requestText: string;
};

const normalizeRequestText = (value: string | null | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const plannerTaskSchema = z.object({
  title: z.string().trim().min(1),
  objective: z.string().trim().min(1),
});

const requestTitleSchema = z.object({
  title: z.string().trim().min(1),
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

const requestTitleOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title"],
  properties: {
    title: {
      type: "string",
      minLength: 1,
      maxLength: 80,
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
    requestTitle: null,
    requestText: null,
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

const buildPlannerRequestContext = (state: TeamRunState): string => {
  const sections: string[] = [];
  const latestInput = state.latestInput?.trim();
  const requestTitle = normalizeRequestTitle(state.requestTitle);
  const requestText = state.requestText?.trim();

  if (requestTitle) {
    sections.push(`Current request title: ${requestTitle}`);
  }

  if (requestText) {
    sections.push(`Raw request text:\n${requestText}`);
  }

  if (!latestInput) {
    sections.push(
      "Current assignment input: none recorded. Ask for clarification instead of inventing product requirements.",
    );
    return sections.join("\n\n");
  }

  sections.push(
    requestText && latestInput !== requestText
      ? `Current planning input:\n${latestInput}`
      : `Current assignment input:\n${latestInput}`,
  );

  return sections.join("\n\n");
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
    buildPlannerRequestContext(state),
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

const buildRequestTitlePrompt = ({
  input,
  requestText,
}: {
  input: string;
  requestText: string;
}): string => {
  return [
    "Create a concise title for an engineering request.",
    "Rules:",
    "- Keep it plain English and specific.",
    "- Prefer 2 to 8 words when possible.",
    "- Do not include quotes, markdown, IDs, or trailing punctuation.",
    `Raw request text:\n${requestText}`,
    input !== requestText ? `Current planning input:\n${input}` : null,
    "Final response requirements:",
    "- Return JSON that matches the provided schema exactly.",
    "- Put the title in title.",
  ]
    .filter(Boolean)
    .join("\n\n");
};

const generateRequestTitle = async ({
  input,
  requestText,
  worktreePath,
}: {
  input: string;
  requestText: string;
  worktreePath: string;
}): Promise<string | null> => {
  const response = await runCodexStructuredOutput({
    worktreePath,
    prompt: buildRequestTitlePrompt({
      input,
      requestText,
    }),
    responseSchema: requestTitleSchema,
    outputJsonSchema: requestTitleOutputJsonSchema,
    codexHomePrefix: "request-title",
  });

  return normalizeRequestTitle(response.title);
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
}): {
  state: TeamRunState;
  shouldResetAssignment: boolean;
} => {
  const baseState = buildInitialState(reset, selectedRepository);
  if (!existingThread) {
    return {
      state: {
        ...baseState,
        latestInput: input,
        forceReset: false,
      },
      shouldResetAssignment: true,
    };
  }

  const storedData = existingThread.data;
  const shouldResetAssignment =
    reset ||
    storedData.latestInput !== input ||
    (storedData.selectedRepository?.id ?? null) !== (selectedRepository?.id ?? null);

  return {
    state: {
      ...baseState,
      assignmentNumber: shouldResetAssignment
        ? (storedData.assignmentNumber ?? 0) + 1
        : storedData.assignmentNumber,
      latestInput: input,
      handoffCounter: shouldResetAssignment ? 0 : storedData.handoffCounter,
      handoffs: shouldResetAssignment ? {} : filterWorkflowHandoffs(storedData),
      forceReset: false,
    },
    shouldResetAssignment,
  };
};

const resolveRequestMetadata = async ({
  input,
  providedTitle,
  providedRequestText,
  existingThread,
  shouldResetAssignment,
  worktreePath,
  logEvent,
}: {
  input: string;
  providedTitle?: string;
  providedRequestText?: string;
  existingThread: Awaited<ReturnType<typeof getTeamThreadRecord>>;
  shouldResetAssignment: boolean;
  worktreePath: string;
  logEvent?: (event: TeamCodexEvent) => Promise<void> | void;
}): Promise<ResolvedRequestMetadata> => {
  const requestText =
    normalizeRequestText(providedRequestText) ??
    (shouldResetAssignment ? null : normalizeRequestText(existingThread?.data.requestText)) ??
    input.trim();
  const humanTitle = normalizeRequestTitle(providedTitle);

  if (humanTitle) {
    await logEvent?.({
      source: "system",
      message: `Using human request title: ${humanTitle}`,
      createdAt: new Date().toISOString(),
    });

    return {
      requestTitle: humanTitle,
      requestText,
    };
  }

  const preservedTitle =
    shouldResetAssignment ? null : normalizeRequestTitle(existingThread?.data.requestTitle);
  if (preservedTitle) {
    await logEvent?.({
      source: "system",
      message: `Reusing request title: ${preservedTitle}`,
      createdAt: new Date().toISOString(),
    });

    return {
      requestTitle: preservedTitle,
      requestText,
    };
  }

  try {
    const generatedTitle = await generateRequestTitle({
      input,
      requestText,
      worktreePath,
    });

    if (generatedTitle) {
      await logEvent?.({
        source: "system",
        message: `Generated request title: ${generatedTitle}`,
        createdAt: new Date().toISOString(),
      });

      return {
        requestTitle: generatedTitle,
        requestText,
      };
    }
  } catch (error) {
    await logEvent?.({
      source: "system",
      message: `Request title generation fell back to a deterministic title: ${
        error instanceof Error ? error.message : "Unknown error."
      }`,
      createdAt: new Date().toISOString(),
    });
  }

  const fallbackTitle = buildDeterministicRequestTitle(requestText);
  await logEvent?.({
    source: "system",
    message: `Using deterministic request title fallback: ${fallbackTitle}`,
    createdAt: new Date().toISOString(),
  });

  return {
    requestTitle: fallbackTitle,
    requestText,
  };
};

export const runTeam = async ({
  input,
  threadId,
  title,
  requestText,
  repositoryId,
  reset,
  deleteExistingBranches,
  onPlannerLogEntry,
}: {
  input: string;
  threadId?: string;
  title?: string;
  requestText?: string;
  repositoryId?: string;
  reset?: boolean;
  deleteExistingBranches?: boolean;
  onPlannerLogEntry?: (entry: TeamCodexLogEntry) => Promise<void> | void;
}): Promise<TeamRunSummary> => {
  const selectedRepository = await findConfiguredRepository(teamConfig, repositoryId);

  if (repositoryId && !selectedRepository) {
    throw new Error(
      "Selected repository is not available. Only repositories discovered from directories listed in team.config.ts can be used.",
    );
  }

  const resolvedThreadId = threadId ?? crypto.randomUUID();
  const existingThread = await getTeamThreadRecord(teamConfig.storage.threadFile, resolvedThreadId);
  const { state, shouldResetAssignment } = buildRunState({
    input,
    reset: Boolean(reset),
    selectedRepository,
    existingThread,
  });

  const forwardPlannerEvent = async (event: TeamCodexEvent): Promise<void> => {
    const entry = await appendTeamCodexLogEvent({
      threadFile: teamConfig.storage.threadFile,
      threadId: resolvedThreadId,
      assignmentNumber: state.assignmentNumber,
      roleId: "planner",
      laneId: null,
      event,
    });

    try {
      await onPlannerLogEntry?.(entry);
    } catch (error) {
      console.error(
        `[team-run:${resolvedThreadId}] Unable to forward planner log entry: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
      );
    }
  };

  const requestMetadata = await resolveRequestMetadata({
    input,
    providedTitle: title,
    providedRequestText: requestText,
    existingThread,
    shouldResetAssignment,
    worktreePath: selectedRepository?.path ?? process.cwd(),
    logEvent: forwardPlannerEvent,
  });
  state.requestTitle = requestMetadata.requestTitle;
  state.requestText = requestMetadata.requestText;

  try {
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
      onEvent: forwardPlannerEvent,
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
        requestTitle: requestMetadata.requestTitle,
        requestText: requestMetadata.requestText,
        plannerSummary: plannerResponse.dispatch.planSummary,
        plannerDeliverable: plannerResponse.dispatch.plannerDeliverable,
        branchPrefix: plannerResponse.dispatch.branchPrefix,
        tasks: plannerResponse.dispatch.tasks,
        deleteExistingBranches,
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
      requestTitle: requestMetadata.requestTitle,
      requestText: requestMetadata.requestText,
      approved: false,
      repository: selectedRepository,
      workflow: state.workflow,
      handoffs: getOrderedHandoffs(state),
      steps: [step],
    };
  } catch (error) {
    if (error instanceof ExistingBranchesRequireDeleteError) {
      try {
        await updateTeamThreadRecord({
          threadFile: teamConfig.storage.threadFile,
          threadId: resolvedThreadId,
          updater: (thread, now) => {
            thread.run = {
              status: "completed",
              startedAt: thread.run?.startedAt ?? thread.createdAt,
              finishedAt: now,
              lastError: error.message,
            };
          },
        });
      } catch {
        // The thread may not have been created yet.
      }

      await forwardPlannerEvent({
        source: "system",
        message: error.message,
        createdAt: new Date().toISOString(),
      });
      throw error;
    }

    await forwardPlannerEvent({
      source: "system",
      message: `Planner run failed: ${error instanceof Error ? error.message : "Unknown error."}`,
      createdAt: new Date().toISOString(),
    });
    throw error;
  }
};
