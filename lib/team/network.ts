import { teamConfig } from "@/team.config";
import { applyHandoff } from "@/lib/team/agent-helpers";
import {
  createPlannerDispatchAssignment,
  DispatchThreadCapacityError,
  ensurePendingDispatchWork,
} from "@/lib/team/dispatch";
import { ExistingBranchesRequireDeleteError } from "@/lib/team/git";
import {
  appendTeamExecutionStep,
  countActiveDispatchThreads,
  getTeamThreadRecord,
  updateTeamThreadRecord,
  upsertTeamThreadRun,
} from "@/lib/team/history";
import { appendTeamCodexLogEvent } from "@/lib/team/logs";
import { loadRolePrompt } from "@/lib/team/prompts";
import { buildDeterministicRequestTitle, normalizeRequestTitle } from "@/lib/team/request-title";
import { findConfiguredRepository } from "@/lib/team/repositories";
import {
  resolveTeamRoleDependencies,
  type TeamRoleDependencies,
} from "@/lib/team/roles/dependencies";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import type {
  TeamCodexEvent,
  TeamCodexLogEntry,
  TeamExecutionStep,
  TeamRoleHandoff,
} from "@/lib/team/types";

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

const filterWorkflowHandoffs = (state: TeamRunState): Partial<Record<string, TeamRoleHandoff>> => {
  return Object.fromEntries(
    Object.entries(state.handoffs).filter(([roleId]) => state.workflow.includes(roleId)),
  );
};

const getOrderedHandoffs = (state: TeamRunState): TeamRoleHandoff[] => {
  return Object.values(filterWorkflowHandoffs(state))
    .filter((handoff): handoff is TeamRoleHandoff => Boolean(handoff))
    .sort((left, right) => left.sequence - right.sequence);
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
  dependencies,
  logEvent,
}: {
  input: string;
  providedTitle?: string;
  providedRequestText?: string;
  existingThread: Awaited<ReturnType<typeof getTeamThreadRecord>>;
  shouldResetAssignment: boolean;
  worktreePath: string;
  dependencies: TeamRoleDependencies;
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

  const preservedTitle = shouldResetAssignment
    ? null
    : normalizeRequestTitle(existingThread?.data.requestTitle);
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
    const generatedTitleResponse = await dependencies.requestTitleAgent.run({
      input,
      requestText,
      worktreePath,
    });
    const generatedTitle = normalizeRequestTitle(generatedTitleResponse.title);

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
  dependencies,
}: {
  input: string;
  threadId?: string;
  title?: string;
  requestText?: string;
  repositoryId?: string;
  reset?: boolean;
  deleteExistingBranches?: boolean;
  onPlannerLogEntry?: (entry: TeamCodexLogEntry) => Promise<void> | void;
  dependencies?: Partial<TeamRoleDependencies>;
}): Promise<TeamRunSummary> => {
  const resolvedDependencies = resolveTeamRoleDependencies(dependencies);
  const selectedRepository = await findConfiguredRepository(teamConfig, repositoryId);

  if (repositoryId && !selectedRepository) {
    throw new Error(
      "Selected repository is not available. Only repositories discovered from directories listed in team.config.ts can be used.",
    );
  }

  if (selectedRepository) {
    const activeDispatchThreadCount = await countActiveDispatchThreads(
      teamConfig.storage.threadFile,
    );
    if (activeDispatchThreadCount >= teamConfig.dispatch.workerCount) {
      throw new DispatchThreadCapacityError(teamConfig.dispatch.workerCount);
    }
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
    dependencies: resolvedDependencies,
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
    const plannerResponse = await resolvedDependencies.plannerAgent.run({
      role: plannerRole,
      worktreePath: selectedRepository?.path ?? process.cwd(),
      state,
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
      dependencies: resolvedDependencies,
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
