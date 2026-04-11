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
import {
  buildCanonicalRequestTitle,
  buildDeterministicRequestTitle,
  normalizeConventionalTitleMetadata,
  normalizeRequestTitle,
  parseConventionalTitle,
  type ConventionalTitleMetadata,
} from "@/lib/team/request-title";
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
  conventionalTitle: ConventionalTitleMetadata | null;
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
  conventionalTitle: ConventionalTitleMetadata | null;
  requestText: string;
};

type InitialRequestMetadata = {
  requestTitle: string | null;
  conventionalTitle: ConventionalTitleMetadata | null;
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
    conventionalTitle: null,
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
  logEvent,
}: {
  input: string;
  providedTitle?: string;
  providedRequestText?: string;
  existingThread: Awaited<ReturnType<typeof getTeamThreadRecord>>;
  shouldResetAssignment: boolean;
  logEvent?: (event: TeamCodexEvent) => Promise<void> | void;
}): Promise<InitialRequestMetadata> => {
  const requestText =
    normalizeRequestText(providedRequestText) ??
    (shouldResetAssignment ? null : normalizeRequestText(existingThread?.data.requestText)) ??
    input.trim();
  const humanTitle = normalizeRequestTitle(providedTitle);
  const humanConventionalTitle = parseConventionalTitle(humanTitle)?.metadata ?? null;

  if (humanTitle) {
    await logEvent?.({
      source: "system",
      message: `Using human request title: ${humanTitle}`,
      createdAt: new Date().toISOString(),
    });

    return {
      requestTitle: humanTitle,
      conventionalTitle: humanConventionalTitle,
      requestText,
    };
  }

  const preservedTitle = shouldResetAssignment
    ? null
    : normalizeRequestTitle(existingThread?.data.requestTitle);
  const preservedConventionalTitle = shouldResetAssignment
    ? null
    : (normalizeConventionalTitleMetadata(existingThread?.data.conventionalTitle) ??
      parseConventionalTitle(existingThread?.data.requestTitle)?.metadata ??
      null);
  if (preservedTitle) {
    await logEvent?.({
      source: "system",
      message: `Reusing request title: ${preservedTitle}`,
      createdAt: new Date().toISOString(),
    });

    return {
      requestTitle: preservedTitle,
      conventionalTitle: preservedConventionalTitle,
      requestText,
    };
  }

  return {
    requestTitle: null,
    conventionalTitle: null,
    requestText,
  };
};

const generateRequestMetadata = async ({
  input,
  requestText,
  tasks,
  worktreePath,
  dependencies,
  logEvent,
}: {
  input: string;
  requestText: string;
  tasks?: Array<{
    title: string;
    objective: string;
  }> | null;
  worktreePath: string;
  dependencies: TeamRoleDependencies;
  logEvent?: (event: TeamCodexEvent) => Promise<void> | void;
}): Promise<{
  requestTitle: string | null;
  conventionalTitle: ConventionalTitleMetadata | null;
} | null> => {
  try {
    const generatedTitleResponse = await dependencies.requestTitleAgent.run({
      input,
      requestText,
      worktreePath,
      tasks,
    });
    const generatedTitle = normalizeRequestTitle(generatedTitleResponse.title);
    const generatedConventionalTitle = normalizeConventionalTitleMetadata(
      generatedTitleResponse.conventionalTitle,
    );

    if (generatedTitle || generatedConventionalTitle) {
      await logEvent?.({
        source: "system",
        message: `Generated request title: ${generatedTitle ?? "Untitled Request"}`,
        createdAt: new Date().toISOString(),
      });

      return {
        requestTitle: generatedTitle,
        conventionalTitle: generatedConventionalTitle,
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

  return null;
};

const finalizeRequestMetadata = async ({
  initialMetadata,
  input,
  tasks,
  worktreePath,
  dependencies,
  logEvent,
}: {
  initialMetadata: InitialRequestMetadata;
  input: string;
  tasks?: Array<{
    title: string;
    objective: string;
  }> | null;
  worktreePath: string;
  dependencies: TeamRoleDependencies;
  logEvent?: (event: TeamCodexEvent) => Promise<void> | void;
}): Promise<ResolvedRequestMetadata> => {
  const shouldGenerate =
    !initialMetadata.requestTitle || (Boolean(tasks?.length) && !initialMetadata.conventionalTitle);
  const generatedMetadata = shouldGenerate
    ? await generateRequestMetadata({
        input,
        requestText: initialMetadata.requestText,
        tasks,
        worktreePath,
        dependencies,
        logEvent,
      })
    : null;

  const requestTitle =
    initialMetadata.requestTitle ??
    generatedMetadata?.requestTitle ??
    buildDeterministicRequestTitle(initialMetadata.requestText);
  const conventionalTitle =
    initialMetadata.conventionalTitle ??
    (tasks?.length ? (generatedMetadata?.conventionalTitle ?? null) : null);

  if (!initialMetadata.requestTitle && !generatedMetadata?.requestTitle) {
    await logEvent?.({
      source: "system",
      message: `Using deterministic request title fallback: ${requestTitle}`,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    requestTitle,
    conventionalTitle,
    requestText: initialMetadata.requestText,
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
    logEvent: forwardPlannerEvent,
  });
  state.requestTitle = requestMetadata.requestTitle;
  state.conventionalTitle = requestMetadata.conventionalTitle;
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

    const finalizedRequestMetadata = await finalizeRequestMetadata({
      initialMetadata: requestMetadata,
      input,
      tasks: plannerResponse.dispatch?.tasks ?? null,
      worktreePath: selectedRepository?.path ?? process.cwd(),
      dependencies: resolvedDependencies,
      logEvent: forwardPlannerEvent,
    });

    if (selectedRepository && plannerResponse.dispatch) {
      const canonicalRequestTitle = buildCanonicalRequestTitle({
        requestTitle: finalizedRequestMetadata.requestTitle,
        taskTitle: plannerResponse.dispatch.tasks[0]?.title ?? null,
        taskCount: plannerResponse.dispatch.tasks.length,
        conventionalTitle: finalizedRequestMetadata.conventionalTitle,
      });

      state.requestTitle = canonicalRequestTitle;
      state.conventionalTitle = finalizedRequestMetadata.conventionalTitle;

      if (canonicalRequestTitle !== finalizedRequestMetadata.requestTitle) {
        await forwardPlannerEvent({
          source: "system",
          message: `Normalized canonical request title: ${canonicalRequestTitle}`,
          createdAt: new Date().toISOString(),
        });
      }

      await createPlannerDispatchAssignment({
        threadId: resolvedThreadId,
        assignmentNumber: state.assignmentNumber,
        repository: selectedRepository,
        requestTitle: canonicalRequestTitle,
        conventionalTitle: finalizedRequestMetadata.conventionalTitle,
        requestText: finalizedRequestMetadata.requestText,
        plannerSummary: plannerResponse.dispatch.planSummary,
        plannerDeliverable: plannerResponse.dispatch.plannerDeliverable,
        branchPrefix: plannerResponse.dispatch.branchPrefix,
        tasks: plannerResponse.dispatch.tasks,
        deleteExistingBranches,
      });
    } else {
      state.requestTitle = finalizedRequestMetadata.requestTitle;
      state.conventionalTitle = finalizedRequestMetadata.conventionalTitle;
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
      requestTitle: state.requestTitle ?? finalizedRequestMetadata.requestTitle,
      requestText: finalizedRequestMetadata.requestText,
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
