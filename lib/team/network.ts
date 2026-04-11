import { teamConfig } from "@/team.config";
import { applyHandoff } from "@/lib/team/agent-helpers";
import {
  approveLanePullRequest,
  createPlannerDispatchAssignment,
  DispatchThreadCapacityError,
  ensurePendingDispatchWork,
  queueLaneProposalForExecution,
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

export type TeamPlanningRunArgs = {
  kind: "planning";
  input: string;
  threadId: string;
  title?: string;
  requestText?: string;
  repositoryId?: string;
  reset?: boolean;
  deleteExistingBranches?: boolean;
};

export type TeamDispatchRunArgs = {
  kind: "dispatch";
  threadId?: string;
};

export type TeamProposalApprovalRunArgs = {
  kind: "proposal-approval";
  threadId: string;
  assignmentNumber: number;
  laneId: string;
};

export type TeamPullRequestApprovalRunArgs = {
  kind: "pull-request-approval";
  threadId: string;
  assignmentNumber: number;
  laneId: string;
};

export type TeamRunArgs =
  | TeamPlanningRunArgs
  | TeamDispatchRunArgs
  | TeamProposalApprovalRunArgs
  | TeamPullRequestApprovalRunArgs;

export type TeamRunStage =
  | "init"
  | "planning"
  | "metadata-generation"
  | "coding"
  | "reviewing"
  | "archiving"
  | "completed";

export type TeamRunResult = TeamRunSummary | null;

export type TeamRunEnv = {
  deps: TeamRoleDependencies;
  persistState: (state: TeamRunMachineState) => Promise<void> | void;
  onPlannerLogEntry?: (entry: TeamCodexLogEntry) => Promise<void> | void;
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

type PlannerAgentResult = Awaited<ReturnType<TeamRoleDependencies["plannerAgent"]["run"]>>;

type TeamRunPlanningContext = {
  threadId: string;
  selectedRepository: TeamRepositoryOption | null;
  existingThread: Awaited<ReturnType<typeof getTeamThreadRecord>>;
  shouldResetAssignment: boolean;
  state: TeamRunState;
  requestMetadata: InitialRequestMetadata;
};

type TeamRunInitState = {
  stage: "init";
  args: TeamRunArgs;
};

type TeamRunPlanningStageState = {
  stage: "planning";
  args: TeamPlanningRunArgs;
  context: TeamRunPlanningContext;
};

type TeamRunMetadataGenerationStageState = {
  stage: "metadata-generation";
  args: TeamPlanningRunArgs;
  context: TeamRunPlanningContext;
  plannerResponse: PlannerAgentResult;
  plannerRoleName: string;
};

type TeamRunCodingStageState = {
  stage: "coding";
  args: TeamProposalApprovalRunArgs;
};

type TeamRunReviewingStageState = {
  stage: "reviewing";
  args: TeamRunArgs;
  threadId?: string;
  result: TeamRunResult;
};

type TeamRunArchivingStageState = {
  stage: "archiving";
  args: TeamPullRequestApprovalRunArgs;
};

type TeamRunCompletedState = {
  stage: "completed";
  args: TeamRunArgs;
  result: TeamRunResult;
};

export type TeamRunMachineState =
  | TeamRunInitState
  | TeamRunPlanningStageState
  | TeamRunMetadataGenerationStageState
  | TeamRunCodingStageState
  | TeamRunReviewingStageState
  | TeamRunArchivingStageState
  | TeamRunCompletedState;

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

const noopPersistState: TeamRunEnv["persistState"] = async () => undefined;

export const createInitialTeamRunState = (args: TeamRunArgs): TeamRunMachineState => {
  return {
    stage: "init",
    args,
  };
};

export const createTeamRunEnv = ({
  dependencies,
  persistState,
  onPlannerLogEntry,
}: {
  dependencies?: Partial<TeamRoleDependencies>;
  persistState?: TeamRunEnv["persistState"];
  onPlannerLogEntry?: TeamRunEnv["onPlannerLogEntry"];
} = {}): TeamRunEnv => {
  return {
    deps: resolveTeamRoleDependencies(dependencies),
    persistState: persistState ?? noopPersistState,
    onPlannerLogEntry,
  };
};

export const persistTeamRunState = async (
  env: TeamRunEnv,
  state: TeamRunMachineState,
): Promise<void> => {
  await env.persistState(state);
};

const createPlannerEventForwarder = ({
  env,
  threadId,
  assignmentNumber,
}: {
  env: TeamRunEnv;
  threadId: string;
  assignmentNumber: number;
}) => {
  return async (event: TeamCodexEvent): Promise<void> => {
    const entry = await appendTeamCodexLogEvent({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      assignmentNumber,
      roleId: "planner",
      laneId: null,
      event,
    });

    try {
      await env.onPlannerLogEntry?.(entry);
    } catch (error) {
      console.error(
        `[team-run:${threadId}] Unable to forward planner log entry: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
      );
    }
  };
};

const buildPlanningStageState = async (
  env: TeamRunEnv,
  args: TeamPlanningRunArgs,
): Promise<TeamRunPlanningStageState> => {
  const selectedRepository = await findConfiguredRepository(teamConfig, args.repositoryId);

  if (args.repositoryId && !selectedRepository) {
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

  const existingThread = await getTeamThreadRecord(teamConfig.storage.threadFile, args.threadId);
  const { state, shouldResetAssignment } = buildRunState({
    input: args.input,
    reset: Boolean(args.reset),
    selectedRepository,
    existingThread,
  });
  const forwardPlannerEvent = createPlannerEventForwarder({
    env,
    threadId: args.threadId,
    assignmentNumber: state.assignmentNumber,
  });

  const requestMetadata = await resolveRequestMetadata({
    input: args.input,
    providedTitle: args.title,
    providedRequestText: args.requestText,
    existingThread,
    shouldResetAssignment,
    logEvent: forwardPlannerEvent,
  });
  state.requestTitle = requestMetadata.requestTitle;
  state.conventionalTitle = requestMetadata.conventionalTitle;
  state.requestText = requestMetadata.requestText;

  return {
    stage: "planning",
    args,
    context: {
      threadId: args.threadId,
      selectedRepository,
      existingThread,
      shouldResetAssignment,
      state,
      requestMetadata,
    },
  };
};

const runPlanningStage = async (
  env: TeamRunEnv,
  currentState: TeamRunPlanningStageState,
): Promise<TeamRunMetadataGenerationStageState> => {
  const {
    args,
    context: { threadId, selectedRepository, state },
  } = currentState;
  const forwardPlannerEvent = createPlannerEventForwarder({
    env,
    threadId,
    assignmentNumber: state.assignmentNumber,
  });

  await upsertTeamThreadRun({
    threadFile: teamConfig.storage.threadFile,
    threadId,
    state,
    input: args.input,
  });

  const plannerRole = await loadRolePrompt("planner");
  const plannerResponse = await env.deps.plannerAgent.run({
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

  return {
    stage: "metadata-generation",
    args,
    context: currentState.context,
    plannerResponse,
    plannerRoleName: plannerRole.name,
  };
};

const runMetadataGenerationStage = async (
  env: TeamRunEnv,
  currentState: TeamRunMetadataGenerationStageState,
): Promise<TeamRunReviewingStageState | TeamRunCompletedState> => {
  const {
    args,
    context: { threadId, selectedRepository, requestMetadata, state },
    plannerResponse,
    plannerRoleName,
  } = currentState;
  const forwardPlannerEvent = createPlannerEventForwarder({
    env,
    threadId,
    assignmentNumber: state.assignmentNumber,
  });
  const finalizedRequestMetadata = await finalizeRequestMetadata({
    initialMetadata: requestMetadata,
    input: args.input,
    tasks: plannerResponse.dispatch?.tasks ?? null,
    worktreePath: selectedRepository?.path ?? process.cwd(),
    dependencies: env.deps,
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
      threadId,
      assignmentNumber: state.assignmentNumber,
      repository: selectedRepository,
      requestTitle: canonicalRequestTitle,
      conventionalTitle: finalizedRequestMetadata.conventionalTitle,
      requestText: finalizedRequestMetadata.requestText,
      plannerSummary: plannerResponse.dispatch.planSummary,
      plannerDeliverable: plannerResponse.dispatch.plannerDeliverable,
      branchPrefix: plannerResponse.dispatch.branchPrefix,
      tasks: plannerResponse.dispatch.tasks,
      deleteExistingBranches: args.deleteExistingBranches,
    });
  } else {
    state.requestTitle = finalizedRequestMetadata.requestTitle;
    state.conventionalTitle = finalizedRequestMetadata.conventionalTitle;
  }

  const step = createPlannerStep({
    agentName: plannerRoleName,
    deliverable: plannerResponse.handoff.deliverable,
  });
  await appendTeamExecutionStep({
    threadFile: teamConfig.storage.threadFile,
    threadId,
    state,
    step,
  });

  const result: TeamRunSummary = {
    threadId,
    assignmentNumber: state.assignmentNumber,
    requestTitle: state.requestTitle ?? finalizedRequestMetadata.requestTitle,
    requestText: finalizedRequestMetadata.requestText,
    approved: false,
    repository: selectedRepository,
    workflow: state.workflow,
    handoffs: getOrderedHandoffs(state),
    steps: [step],
  };

  if (selectedRepository && plannerResponse.dispatch) {
    return {
      stage: "reviewing",
      args,
      threadId,
      result,
    };
  }

  return {
    stage: "completed",
    args,
    result,
  };
};

const runCodingStage = async (
  currentState: TeamRunCodingStageState,
): Promise<TeamRunReviewingStageState> => {
  await queueLaneProposalForExecution({
    threadId: currentState.args.threadId,
    assignmentNumber: currentState.args.assignmentNumber,
    laneId: currentState.args.laneId,
  });

  return {
    stage: "reviewing",
    args: currentState.args,
    threadId: currentState.args.threadId,
    result: null,
  };
};

const runReviewingStage = async (
  env: TeamRunEnv,
  currentState: TeamRunReviewingStageState,
): Promise<TeamRunCompletedState> => {
  await ensurePendingDispatchWork({
    threadId: currentState.threadId,
    dependencies: env.deps,
  });

  return {
    stage: "completed",
    args: currentState.args,
    result: currentState.result,
  };
};

const runArchivingStage = async (
  currentState: TeamRunArchivingStageState,
): Promise<TeamRunCompletedState> => {
  await approveLanePullRequest({
    threadId: currentState.args.threadId,
    assignmentNumber: currentState.args.assignmentNumber,
    laneId: currentState.args.laneId,
  });

  return {
    stage: "completed",
    args: currentState.args,
    result: null,
  };
};

const advanceTeamRunState = async (
  env: TeamRunEnv,
  currentState: TeamRunMachineState,
): Promise<TeamRunMachineState> => {
  switch (currentState.stage) {
    case "init":
      switch (currentState.args.kind) {
        case "planning":
          return buildPlanningStageState(env, currentState.args);
        case "proposal-approval":
          return {
            stage: "coding",
            args: currentState.args,
          };
        case "dispatch":
          return {
            stage: "reviewing",
            args: currentState.args,
            threadId: currentState.args.threadId,
            result: null,
          };
        case "pull-request-approval":
          return {
            stage: "archiving",
            args: currentState.args,
          };
      }
    case "planning":
      return runPlanningStage(env, currentState);
    case "metadata-generation":
      return runMetadataGenerationStage(env, currentState);
    case "coding":
      return runCodingStage(currentState);
    case "reviewing":
      return runReviewingStage(env, currentState);
    case "archiving":
      return runArchivingStage(currentState);
    case "completed":
      return currentState;
  }
};

const isPlanningMachineState = (
  state: TeamRunMachineState,
): state is TeamRunPlanningStageState | TeamRunMetadataGenerationStageState => {
  return state.stage === "planning" || state.stage === "metadata-generation";
};

const handlePlanningStageError = async ({
  env,
  currentState,
  error,
}: {
  env: TeamRunEnv;
  currentState: TeamRunPlanningStageState | TeamRunMetadataGenerationStageState;
  error: unknown;
}): Promise<void> => {
  const { threadId, state } = currentState.context;
  const forwardPlannerEvent = createPlannerEventForwarder({
    env,
    threadId,
    assignmentNumber: state.assignmentNumber,
  });

  if (error instanceof ExistingBranchesRequireDeleteError) {
    try {
      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
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
    return;
  }

  await forwardPlannerEvent({
    source: "system",
    message: `Planner run failed: ${error instanceof Error ? error.message : "Unknown error."}`,
    createdAt: new Date().toISOString(),
  });
};

export const runTeam = async (
  env: TeamRunEnv,
  initialState: TeamRunMachineState,
): Promise<TeamRunResult> => {
  let currentState = initialState;

  while (currentState.stage !== "completed") {
    try {
      currentState = await advanceTeamRunState(env, currentState);
      await env.persistState(currentState);
    } catch (error) {
      if (isPlanningMachineState(currentState)) {
        await handlePlanningStageError({
          env,
          currentState,
          error,
        });
      }

      throw error;
    }
  }

  return currentState.result;
};
