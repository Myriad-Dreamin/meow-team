import "server-only";

import {
  getTeamConfig,
  getTeamThreadFile,
  resolveTeamDispatchWorktreeRoot,
} from "@/lib/config/team-loader";
import { applyHandoff } from "@/lib/team/agent-helpers";
import { listExistingBranches, resolveRepositoryBaseBranch } from "@/lib/git/ops";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import {
  buildCanonicalBranchName,
  buildLaneBranchName,
  deleteManagedBranches,
  ensureLaneWorktree,
  ExistingBranchesRequireDeleteError,
} from "@/lib/team/git";
import {
  appendTeamExecutionStep,
  claimTeamThreadWorktree,
  getTeamThreadRecord,
  synchronizeDispatchAssignment,
  updateTeamThreadRecord,
  upsertTeamThreadRun,
} from "@/lib/team/history";
import { applyThreadOwnedWorktreeToAssignment } from "@/lib/team/coding/thread-worktree";
import { appendTeamCodexLogEvent } from "@/lib/team/logs";
import {
  buildProposalChangeName,
  buildProposalPath,
  materializeAssignmentProposals,
} from "@/lib/team/openspec";
import {
  buildCanonicalRequestTitle,
  buildDeterministicRequestTitle,
  describeConventionalTitleMetadata,
  normalizeConventionalTitleMetadata,
  normalizeRequestTitle,
  parseConventionalTitle,
  type ConventionalTitleMetadata,
} from "@/lib/team/request-title";
import { parseExecutionModeInput, type TeamExecutionMode } from "@/lib/team/execution-mode";
import { findConfiguredRepository } from "@/lib/team/repositories";
import {
  resolveTeamRoleDependencies,
  type TeamRoleDependencies,
} from "@/lib/team/roles/dependencies";
import { plannerRole } from "@/lib/team/roles/planner";
import type {
  InitialRequestMetadata,
  PersistedTeamThread,
  ResolvedRequestMetadata,
  TeamPlanningRunArgs,
  TeamRunCompletedState,
  TeamRunEnv,
  TeamRunMetadataGenerationStageState,
  TeamRunPlanningStageState,
  TeamRunReviewingStageState,
  TeamRunState,
  TeamRunSummary,
} from "@/lib/team/coding/shared";
import { DispatchThreadCapacityError } from "@/lib/team/coding/shared";
import { createRepositoryWorktree, type Worktree } from "@/lib/team/coding/worktree";
import type {
  TeamCodexEvent,
  TeamDispatchAssignment,
  TeamExecutionStep,
  TeamRoleHandoff,
  TeamWorkerEventActor,
  TeamWorkerLaneRecord,
} from "@/lib/team/types";

type DispatchTask = {
  title: string;
  objective: string;
};

let plannerDispatchQueue = Promise.resolve();

const queuePlannerDispatchMaterialization = async <T>(task: () => Promise<T>): Promise<T> => {
  const queuedTask = plannerDispatchQueue.catch(() => undefined).then(task);
  plannerDispatchQueue = queuedTask.then(
    () => undefined,
    () => undefined,
  );
  return queuedTask;
};

const createPlannerNote = (message: string, createdAt: string) => {
  return {
    id: crypto.randomUUID(),
    message,
    createdAt,
  };
};

const createLaneEvent = (actor: TeamWorkerEventActor, message: string, createdAt: string) => {
  return {
    id: crypto.randomUUID(),
    actor,
    message,
    createdAt,
  };
};

const resolveOpenSpecMaterializerAgent = (
  dependencies?: Pick<TeamRoleDependencies, "openSpecMaterializerAgent">,
): TeamRoleDependencies["openSpecMaterializerAgent"] => {
  return (
    dependencies?.openSpecMaterializerAgent ??
    resolveTeamRoleDependencies().openSpecMaterializerAgent
  );
};

const createProposalLane = ({
  threadId,
  laneIndex,
  task,
  branchPrefix,
  assignmentNumber,
  baseBranch,
}: {
  threadId: string;
  laneIndex: number;
  task: DispatchTask;
  branchPrefix: string;
  assignmentNumber: number;
  baseBranch: string;
}): TeamWorkerLaneRecord => {
  const laneId = `lane-${laneIndex}`;
  const now = new Date().toISOString();

  const branchName = buildLaneBranchName({
    threadId,
    branchPrefix,
    assignmentNumber,
    laneIndex,
  });
  const proposalChangeName = buildProposalChangeName({
    branchPrefix,
    assignmentNumber,
    laneIndex,
    taskTitle: task.title,
  });

  return {
    laneId,
    laneIndex,
    status: "idle",
    executionPhase: null,
    taskTitle: task.title,
    taskObjective: task.objective,
    proposalChangeName,
    proposalPath: buildProposalPath(proposalChangeName),
    proposalCommitHash: null,
    finalizationMode: null,
    proposalDisposition: "active",
    finalizationCheckpoint: null,
    workerSlot: null,
    branchName,
    baseBranch,
    worktreePath: null,
    latestImplementationCommit: null,
    pushedCommit: null,
    latestCoderHandoff: null,
    latestReviewerHandoff: null,
    latestDecision: null,
    latestCoderSummary: null,
    latestReviewerSummary: null,
    latestActivity: "Planner is materializing the proposal artifacts before human approval opens.",
    approvalRequestedAt: null,
    approvalGrantedAt: null,
    queuedAt: null,
    runCount: 0,
    revisionCount: 0,
    requeueReason: null,
    lastError: null,
    pullRequest: null,
    events: [createLaneEvent("planner", `Planner proposed: ${task.title}`, now)],
    startedAt: null,
    finishedAt: null,
    updatedAt: now,
  };
};

const markAssignmentReadyForHumanApproval = (
  assignment: TeamDispatchAssignment,
  now: string,
): void => {
  const queueLabel = assignment.executionMode ? "execution-review" : "coding-review";
  const laneActivity = assignment.executionMode
    ? "Proposal is waiting for human approval before execution and review begin."
    : "Proposal is waiting for human approval before coding and review begin.";

  assignment.lanes = assignment.lanes.map((lane) => {
    if (!lane.taskTitle && !lane.taskObjective) {
      return lane;
    }

    return {
      ...lane,
      status: "awaiting_human_approval",
      latestActivity: laneActivity,
      approvalRequestedAt: lane.approvalRequestedAt ?? now,
      updatedAt: now,
    };
  });
  assignment.plannerNotes = [
    ...assignment.plannerNotes,
    createPlannerNote(
      `Planner materialized the proposal artifacts and is waiting for human approval before the ${queueLabel} queue starts.`,
      now,
    ),
  ];
};

const shouldReusePersistedAssignment = (
  assignment: PersistedTeamThread["dispatchAssignments"][number] | null,
): boolean => {
  return Boolean(assignment && assignment.status !== "planning");
};

export const createPlannerDispatchAssignment = async ({
  threadId,
  assignmentNumber,
  executionMode,
  repository,
  worktree,
  requestTitle,
  conventionalTitle,
  requestText,
  plannerSummary,
  plannerDeliverable,
  branchPrefix,
  tasks,
  deleteExistingBranches = false,
  dependencies,
  onMaterializerEvent,
}: {
  threadId: string;
  assignmentNumber: number;
  executionMode?: TeamExecutionMode | null;
  repository: TeamRepositoryOption | null;
  worktree: Worktree | null;
  requestTitle: string;
  conventionalTitle: TeamDispatchAssignment["conventionalTitle"];
  requestText: string;
  plannerSummary: string;
  plannerDeliverable: string;
  branchPrefix: string;
  tasks: DispatchTask[];
  deleteExistingBranches?: boolean;
  dependencies?: Pick<TeamRoleDependencies, "openSpecMaterializerAgent">;
  onMaterializerEvent?: (event: TeamCodexEvent) => Promise<void> | void;
}): Promise<TeamDispatchAssignment> => {
  const teamConfig = getTeamConfig();
  const threadFile = getTeamThreadFile();
  if (!repository) {
    throw new Error("Dispatching worker lanes requires a selected repository.");
  }

  if (!worktree?.slot) {
    throw new Error("Repository-backed planning requires a claimed thread worktree.");
  }

  return queuePlannerDispatchMaterialization(async () => {
    const now = new Date().toISOString();
    const resolvedBaseBranch = await resolveRepositoryBaseBranch(
      repository.path,
      teamConfig.dispatch.baseBranch,
    );
    const resolvedWorktreeRoot = resolveTeamDispatchWorktreeRoot(repository.path);
    const canonicalBranchName = buildCanonicalBranchName({
      threadId,
      branchPrefix,
      assignmentNumber,
    });

    const assignment: TeamDispatchAssignment = synchronizeDispatchAssignment(
      {
        assignmentNumber,
        status: "planning",
        executionMode: executionMode ?? null,
        repository,
        requestTitle,
        conventionalTitle,
        requestText,
        requestedAt: now,
        startedAt: now,
        finishedAt: null,
        updatedAt: now,
        plannerSummary,
        plannerDeliverable,
        branchPrefix,
        canonicalBranchName,
        baseBranch: resolvedBaseBranch,
        threadSlot: null,
        plannerWorktreePath: null,
        workerCount: teamConfig.dispatch.workerCount,
        lanes: tasks.map((task, index) =>
          createProposalLane({
            threadId,
            laneIndex: index + 1,
            task,
            branchPrefix,
            assignmentNumber,
            baseBranch: resolvedBaseBranch,
          }),
        ),
        plannerNotes: [
          createPlannerNote(
            `Planner created ${tasks.length} proposal${tasks.length === 1 ? "" : "s"} and is materializing the proposal artifacts before human approval opens.`,
            now,
          ),
        ],
        humanFeedback: [],
        supersededAt: null,
        supersededReason: null,
      },
      now,
    );
    applyThreadOwnedWorktreeToAssignment({
      assignment,
      worktree,
    });

    await updateTeamThreadRecord({
      threadFile,
      threadId,
      updater: (thread) => {
        thread.data.threadWorktree = worktree;
        thread.dispatchAssignments = [
          ...thread.dispatchAssignments.filter(
            (candidate) => candidate.assignmentNumber !== assignment.assignmentNumber,
          ),
          assignment,
        ].sort((left, right) => left.assignmentNumber - right.assignmentNumber);
      },
    });

    try {
      const targetBranchNames = [
        canonicalBranchName,
        ...assignment.lanes.flatMap((lane) => (lane.branchName ? [lane.branchName] : [])),
      ];
      const existingBranches = await listExistingBranches({
        repositoryPath: repository.path,
        branchNames: targetBranchNames,
      });

      if (existingBranches.length > 0) {
        if (!deleteExistingBranches) {
          throw new ExistingBranchesRequireDeleteError(existingBranches);
        }

        await deleteManagedBranches({
          repositoryPath: repository.path,
          worktreeRoot: resolvedWorktreeRoot,
          branchNames: existingBranches,
        });
        assignment.plannerNotes = [
          createPlannerNote(
            `Human confirmed deletion of existing branches before rematerializing proposals: ${existingBranches.join(", ")}.`,
            now,
          ),
          ...assignment.plannerNotes,
        ];
      }

      await materializeAssignmentProposals({
        repositoryPath: repository.path,
        baseBranch: resolvedBaseBranch,
        canonicalBranchName,
        requestTitle,
        conventionalTitle,
        plannerSummary,
        plannerDeliverable,
        requestInput: requestText,
        worktreeRoot: resolvedWorktreeRoot,
        plannerWorktreePath: worktree.path,
        lanes: assignment.lanes,
        openSpecMaterializerAgent: resolveOpenSpecMaterializerAgent(dependencies),
        onEvent: onMaterializerEvent,
      });
      markAssignmentReadyForHumanApproval(assignment, new Date().toISOString());

      await updateTeamThreadRecord({
        threadFile,
        threadId,
        updater: (thread) => {
          thread.dispatchAssignments = [
            ...thread.dispatchAssignments.filter(
              (candidate) => candidate.assignmentNumber !== assignment.assignmentNumber,
            ),
            assignment,
          ].sort((left, right) => left.assignmentNumber - right.assignmentNumber);
        },
      });

      return assignment;
    } catch (error) {
      await updateTeamThreadRecord({
        threadFile,
        threadId,
        updater: (thread) => {
          thread.dispatchAssignments = thread.dispatchAssignments.filter(
            (candidate) => candidate.assignmentNumber !== assignment.assignmentNumber,
          );
        },
      });

      throw error;
    }
  });
};

const normalizeRequestText = (value: string | null | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const resolveNormalizedExecutionInput = ({
  input,
  providedRequestText,
  preservedExecutionMode,
  providedExecutionMode,
}: {
  input: string;
  providedRequestText?: string;
  preservedExecutionMode?: TeamExecutionMode | null;
  providedExecutionMode?: TeamExecutionMode | null;
}) => {
  const parsedInput = parseExecutionModeInput(input);
  const parsedRequestText = parseExecutionModeInput(providedRequestText);
  const executionMode =
    providedExecutionMode ??
    preservedExecutionMode ??
    parsedRequestText.executionMode ??
    parsedInput.executionMode;

  return {
    executionMode,
    normalizedInput:
      executionMode && parsedInput.executionMode === executionMode
        ? parsedInput.requestText
        : input.trim(),
    requestText:
      normalizeRequestText(providedRequestText) ??
      (executionMode
        ? parsedRequestText.requestText || parsedInput.requestText
        : parsedInput.requestText),
  };
};

const describeUnknownError = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unknown error.";
};

const buildInitialState = (
  forceReset: boolean,
  selectedRepository: TeamRepositoryOption | null,
): TeamRunState => {
  const teamConfig = getTeamConfig();
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
    executionMode: null,
    requestText: null,
    threadWorktree: null,
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

const findPersistedAssignment = (
  thread: Awaited<ReturnType<typeof getTeamThreadRecord>>,
  assignmentNumber: number,
): PersistedTeamThread["dispatchAssignments"][number] | null => {
  return (
    thread?.dispatchAssignments.find(
      (candidate) => candidate.assignmentNumber === assignmentNumber,
    ) ?? null
  );
};

export const findPersistedLane = (
  thread: Awaited<ReturnType<typeof getTeamThreadRecord>>,
  assignmentNumber: number,
  laneId: string,
): PersistedTeamThread["dispatchAssignments"][number]["lanes"][number] | null => {
  return (
    findPersistedAssignment(thread, assignmentNumber)?.lanes.find(
      (candidate) => candidate.laneId === laneId,
    ) ?? null
  );
};

const getPersistedPlannerStep = ({
  thread,
  assignmentNumber,
}: {
  thread: Awaited<ReturnType<typeof getTeamThreadRecord>>;
  assignmentNumber: number;
}): TeamExecutionStep | null => {
  const plannerHandoff = thread?.data.handoffs.planner;
  if (!plannerHandoff || plannerHandoff.assignmentNumber !== assignmentNumber) {
    return null;
  }

  return thread.results.at(-1) ?? null;
};

const resolvePersistedRequestMetadata = ({
  thread,
  assignment,
  fallbackRequestText,
}: {
  thread: Awaited<ReturnType<typeof getTeamThreadRecord>>;
  assignment: PersistedTeamThread["dispatchAssignments"][number] | null;
  fallbackRequestText: string;
}): ResolvedRequestMetadata => {
  const requestText =
    normalizeRequestText(assignment?.requestText ?? thread?.data.requestText) ??
    fallbackRequestText;
  const requestTitle =
    normalizeRequestTitle(assignment?.requestTitle ?? thread?.data.requestTitle) ??
    buildDeterministicRequestTitle(requestText);
  const conventionalTitle =
    normalizeConventionalTitleMetadata(
      assignment?.conventionalTitle ?? thread?.data.conventionalTitle,
    ) ?? null;

  return {
    requestTitle,
    conventionalTitle,
    executionMode: assignment?.executionMode ?? thread?.data.executionMode ?? null,
    requestText,
  };
};

const buildPlanningResult = ({
  threadId,
  state,
  selectedRepository,
  requestMetadata,
  step,
}: {
  threadId: string;
  state: TeamRunState;
  selectedRepository: TeamRepositoryOption | null;
  requestMetadata: ResolvedRequestMetadata;
  step: TeamExecutionStep;
}): TeamRunSummary => {
  return {
    threadId,
    assignmentNumber: state.assignmentNumber,
    requestTitle: state.requestTitle ?? requestMetadata.requestTitle,
    requestText: requestMetadata.requestText,
    approved: false,
    repository: selectedRepository,
    workflow: state.workflow,
    handoffs: getOrderedHandoffs(state),
    steps: [step],
  };
};

export const isLaneQueuedForExecution = (
  lane: PersistedTeamThread["dispatchAssignments"][number]["lanes"][number],
): boolean => {
  return (
    lane.status === "queued" ||
    lane.status === "coding" ||
    lane.status === "reviewing" ||
    lane.status === "approved" ||
    lane.status === "failed" ||
    lane.approvalGrantedAt !== null ||
    lane.queuedAt !== null
  );
};

export const isLanePullRequestFinalized = (
  lane: PersistedTeamThread["dispatchAssignments"][number]["lanes"][number],
): boolean => {
  return lane.status === "approved" && lane.pullRequest?.status === "approved";
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
      executionMode: shouldResetAssignment ? null : (storedData.executionMode ?? null),
      threadWorktree: storedData.threadWorktree ?? null,
      forceReset: false,
    },
    shouldResetAssignment,
  };
};

const preparePlanningWorktree = async ({
  repository,
  worktree,
}: {
  repository: TeamRepositoryOption | null;
  worktree: Worktree;
}): Promise<void> => {
  if (!repository || !worktree.slot) {
    return;
  }

  const teamConfig = getTeamConfig();
  const resolvedBaseBranch = await resolveRepositoryBaseBranch(
    repository.path,
    teamConfig.dispatch.baseBranch,
  );
  const resolvedWorktreeRoot = resolveTeamDispatchWorktreeRoot(repository.path);

  // Planner-side Codex runs need a real checkout on disk before they can `--cd`
  // into the claimed meow slot for request-title and planning work.
  await ensureLaneWorktree({
    repositoryPath: repository.path,
    worktreeRoot: resolvedWorktreeRoot,
    worktreePath: worktree.path,
    branchName: resolvedBaseBranch,
    startPoint: resolvedBaseBranch,
  });
};

const ensurePlanningStageWorktree = async ({
  threadId,
  input,
  state,
}: {
  threadId: string;
  input: string;
  state: TeamRunState;
}): Promise<Worktree> => {
  const teamConfig = getTeamConfig();
  const selectedRepository = state.selectedRepository;
  if (!selectedRepository) {
    return createRepositoryWorktree({
      path: process.cwd(),
    });
  }

  const worktree = await claimTeamThreadWorktree({
    threadFile: getTeamThreadFile(),
    threadId,
    state,
    input,
  });
  if (!worktree?.slot) {
    throw new DispatchThreadCapacityError(teamConfig.dispatch.workerCount);
  }

  await preparePlanningWorktree({
    repository: selectedRepository,
    worktree,
  });
  state.threadWorktree = worktree;

  return worktree;
};

const resolveRequestMetadata = async ({
  input,
  providedTitle,
  providedRequestText,
  providedExecutionMode,
  existingThread,
  shouldResetAssignment,
  worktree,
  dependencies,
  logEvent,
}: {
  input: string;
  providedTitle?: string;
  providedRequestText?: string;
  providedExecutionMode?: TeamExecutionMode | null;
  existingThread: Awaited<ReturnType<typeof getTeamThreadRecord>>;
  shouldResetAssignment: boolean;
  worktree: Worktree;
  dependencies: TeamRoleDependencies;
  logEvent?: (event: TeamCodexEvent) => Promise<void> | void;
}): Promise<InitialRequestMetadata> => {
  const normalizedExecutionInput = resolveNormalizedExecutionInput({
    input,
    providedRequestText,
    preservedExecutionMode: shouldResetAssignment ? null : existingThread?.data.executionMode,
    providedExecutionMode,
  });
  const requestText =
    normalizeRequestText(normalizedExecutionInput.requestText) ??
    (shouldResetAssignment ? null : normalizeRequestText(existingThread?.data.requestText)) ??
    input.trim();
  const humanTitle = normalizeRequestTitle(parseExecutionModeInput(providedTitle).requestText);
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
      executionMode: normalizedExecutionInput.executionMode,
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
      executionMode: normalizedExecutionInput.executionMode,
      requestText,
    };
  }

  try {
    const generatedMetadata = await generateRequestMetadata({
      input: normalizedExecutionInput.normalizedInput,
      requestText,
      tasks: null,
      worktree,
      dependencies,
    });

    if (generatedMetadata.requestTitle) {
      await logEvent?.({
        source: "system",
        message: `Generated request title: ${generatedMetadata.requestTitle}`,
        createdAt: new Date().toISOString(),
      });

      return {
        requestTitle: generatedMetadata.requestTitle,
        conventionalTitle: generatedMetadata.conventionalTitle,
        executionMode: normalizedExecutionInput.executionMode,
        requestText,
      };
    }
  } catch (error) {
    await logEvent?.({
      source: "system",
      message: `Request title generation fell back to a deterministic title: ${describeUnknownError(
        error,
      )}`,
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
    conventionalTitle: null,
    executionMode: normalizedExecutionInput.executionMode,
    requestText,
  };
};

const generateRequestMetadata = async ({
  input,
  requestText,
  tasks,
  worktree,
  dependencies,
}: {
  input: string;
  requestText: string;
  tasks?: Array<{
    title: string;
    objective: string;
  }> | null;
  worktree: Worktree;
  dependencies: TeamRoleDependencies;
}): Promise<{
  requestTitle: string | null;
  conventionalTitle: ConventionalTitleMetadata | null;
}> => {
  const generatedTitleResponse = await dependencies.requestTitleAgent.run({
    input,
    requestText,
    worktree,
    tasks,
  });

  return {
    requestTitle: normalizeRequestTitle(generatedTitleResponse.title),
    conventionalTitle: tasks?.length
      ? normalizeConventionalTitleMetadata(generatedTitleResponse.conventionalTitle)
      : null,
  };
};

const finalizeRequestMetadata = async ({
  initialMetadata,
  input,
  tasks,
  worktree,
  dependencies,
  logEvent,
}: {
  initialMetadata: InitialRequestMetadata;
  input: string;
  tasks?: Array<{
    title: string;
    objective: string;
  }> | null;
  worktree: Worktree;
  dependencies: TeamRoleDependencies;
  logEvent?: (event: TeamCodexEvent) => Promise<void> | void;
}): Promise<ResolvedRequestMetadata> => {
  const shouldGenerateTitle = !initialMetadata.requestTitle;
  const shouldGenerateConventionalTitle =
    Boolean(tasks?.length) && !initialMetadata.conventionalTitle;
  let generatedMetadata: {
    requestTitle: string | null;
    conventionalTitle: ConventionalTitleMetadata | null;
  } | null = null;
  let generationError: unknown = null;

  if (shouldGenerateTitle || shouldGenerateConventionalTitle) {
    try {
      generatedMetadata = await generateRequestMetadata({
        input:
          initialMetadata.executionMode &&
          parseExecutionModeInput(input).executionMode === initialMetadata.executionMode
            ? parseExecutionModeInput(input).requestText
            : input,
        requestText: initialMetadata.requestText,
        tasks,
        worktree,
        dependencies,
      });
    } catch (error) {
      generationError = error;
    }
  }

  const shouldRefineSingleProposalTitle = Boolean(
    tasks?.length === 1 && generatedMetadata?.requestTitle,
  );
  const requestTitle =
    (shouldRefineSingleProposalTitle ? generatedMetadata?.requestTitle : null) ??
    initialMetadata.requestTitle ??
    generatedMetadata?.requestTitle ??
    buildDeterministicRequestTitle(initialMetadata.requestText);
  const conventionalTitle =
    initialMetadata.conventionalTitle ??
    (tasks?.length ? (generatedMetadata?.conventionalTitle ?? null) : null);

  if (shouldGenerateTitle && generatedMetadata?.requestTitle) {
    await logEvent?.({
      source: "system",
      message: `Generated request title: ${generatedMetadata.requestTitle}`,
      createdAt: new Date().toISOString(),
    });
  }

  if (shouldGenerateTitle && !generatedMetadata?.requestTitle) {
    if (generationError) {
      await logEvent?.({
        source: "system",
        message: `Request title generation fell back to a deterministic title: ${describeUnknownError(
          generationError,
        )}`,
        createdAt: new Date().toISOString(),
      });
    }

    await logEvent?.({
      source: "system",
      message: `Using deterministic request title fallback: ${requestTitle}`,
      createdAt: new Date().toISOString(),
    });
  }

  if (shouldGenerateConventionalTitle && generatedMetadata?.conventionalTitle) {
    await logEvent?.({
      source: "system",
      message: `Generated conventional title metadata: ${describeConventionalTitleMetadata(
        generatedMetadata.conventionalTitle,
      )}`,
      createdAt: new Date().toISOString(),
    });
  } else if (shouldGenerateConventionalTitle && generationError && !shouldGenerateTitle) {
    await logEvent?.({
      source: "system",
      message: `Conventional title metadata generation was skipped: ${describeUnknownError(
        generationError,
      )}`,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    requestTitle,
    conventionalTitle,
    executionMode: initialMetadata.executionMode,
    requestText: initialMetadata.requestText,
  };
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
  const threadFile = getTeamThreadFile();
  return async (event: TeamCodexEvent): Promise<void> => {
    const entry = await appendTeamCodexLogEvent({
      threadFile,
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

export const buildPlanningStageState = async (
  env: TeamRunEnv,
  args: TeamPlanningRunArgs,
): Promise<TeamRunPlanningStageState> => {
  const teamConfig = getTeamConfig();
  const threadFile = getTeamThreadFile();
  const selectedRepository = await findConfiguredRepository(teamConfig, args.repositoryId);

  if (args.repositoryId && !selectedRepository) {
    throw new Error(
      "Selected repository is not available. Only repositories discovered from directories listed in team.config.ts can be used.",
    );
  }

  const existingThread = await getTeamThreadRecord(threadFile, args.threadId);
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
  const worktree = await ensurePlanningStageWorktree({
    threadId: args.threadId,
    input: args.input,
    state,
  });

  const requestMetadata = await resolveRequestMetadata({
    input: args.input,
    providedTitle: args.title,
    providedRequestText: args.requestText,
    providedExecutionMode: args.executionMode,
    existingThread,
    shouldResetAssignment,
    worktree,
    dependencies: env.deps,
    logEvent: forwardPlannerEvent,
  });
  state.requestTitle = requestMetadata.requestTitle;
  state.conventionalTitle = requestMetadata.conventionalTitle;
  state.executionMode = requestMetadata.executionMode;
  state.requestText = requestMetadata.requestText;
  state.threadWorktree = selectedRepository ? worktree : null;

  return {
    stage: "planning",
    args,
    context: {
      threadId: args.threadId,
      worktree,
      selectedRepository,
      existingThread,
      shouldResetAssignment,
      state,
      requestMetadata,
    },
  };
};

export const runPlanningStage = async (
  env: TeamRunEnv,
  currentState: TeamRunPlanningStageState,
): Promise<TeamRunMetadataGenerationStageState> => {
  const threadFile = getTeamThreadFile();
  const {
    args,
    context: { threadId, selectedRepository, state, worktree },
  } = currentState;
  state.threadWorktree = selectedRepository ? worktree : null;
  const forwardPlannerEvent = createPlannerEventForwarder({
    env,
    threadId,
    assignmentNumber: state.assignmentNumber,
  });

  await upsertTeamThreadRun({
    threadFile,
    threadId,
    state,
    input: args.input,
  });

  const plannerResponse = await env.deps.plannerAgent.run({
    worktree,
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

export const runMetadataGenerationStage = async (
  env: TeamRunEnv,
  currentState: TeamRunMetadataGenerationStageState,
): Promise<TeamRunReviewingStageState | TeamRunCompletedState> => {
  const threadFile = getTeamThreadFile();
  const persistedThread = await getTeamThreadRecord(threadFile, currentState.context.threadId);
  const {
    args,
    context: { threadId, selectedRepository, requestMetadata, state, worktree },
    plannerResponse,
    plannerRoleName,
  } = currentState;
  state.threadWorktree = selectedRepository ? worktree : null;
  const forwardPlannerEvent = createPlannerEventForwarder({
    env,
    threadId,
    assignmentNumber: state.assignmentNumber,
  });
  const persistedAssignment = findPersistedAssignment(persistedThread, state.assignmentNumber);
  const persistedPlannerStep = getPersistedPlannerStep({
    thread: persistedThread,
    assignmentNumber: state.assignmentNumber,
  });
  const finalizedRequestMetadata =
    shouldReusePersistedAssignment(persistedAssignment) || persistedPlannerStep
      ? resolvePersistedRequestMetadata({
          thread: persistedThread,
          assignment: persistedAssignment,
          fallbackRequestText: requestMetadata.requestText,
        })
      : await finalizeRequestMetadata({
          initialMetadata: requestMetadata,
          input: args.input,
          tasks: plannerResponse.dispatch?.tasks ?? null,
          worktree,
          dependencies: env.deps,
          logEvent: forwardPlannerEvent,
        });
  state.requestText = finalizedRequestMetadata.requestText;
  state.executionMode = finalizedRequestMetadata.executionMode;

  if (selectedRepository && plannerResponse.dispatch) {
    const canonicalRequestTitle =
      normalizeRequestTitle(persistedAssignment?.requestTitle) ??
      buildCanonicalRequestTitle({
        requestTitle: finalizedRequestMetadata.requestTitle,
        taskTitle: plannerResponse.dispatch.tasks[0]?.title ?? null,
        taskCount: plannerResponse.dispatch.tasks.length,
        conventionalTitle: finalizedRequestMetadata.conventionalTitle,
      });

    state.requestTitle = canonicalRequestTitle;
    state.conventionalTitle =
      normalizeConventionalTitleMetadata(persistedAssignment?.conventionalTitle) ??
      finalizedRequestMetadata.conventionalTitle;

    if (!persistedAssignment && canonicalRequestTitle !== finalizedRequestMetadata.requestTitle) {
      await forwardPlannerEvent({
        source: "system",
        message: `Normalized canonical request title: ${canonicalRequestTitle}`,
        createdAt: new Date().toISOString(),
      });
    }

    if (!shouldReusePersistedAssignment(persistedAssignment)) {
      await createPlannerDispatchAssignment({
        threadId,
        assignmentNumber: state.assignmentNumber,
        executionMode: finalizedRequestMetadata.executionMode,
        repository: selectedRepository,
        worktree,
        requestTitle: canonicalRequestTitle,
        conventionalTitle: finalizedRequestMetadata.conventionalTitle,
        requestText: finalizedRequestMetadata.requestText,
        plannerSummary: plannerResponse.dispatch.planSummary,
        plannerDeliverable: plannerResponse.dispatch.plannerDeliverable,
        branchPrefix: plannerResponse.dispatch.branchPrefix,
        tasks: plannerResponse.dispatch.tasks,
        deleteExistingBranches: args.deleteExistingBranches,
        dependencies: env.deps,
        onMaterializerEvent: forwardPlannerEvent,
      });
    }
  } else {
    state.requestTitle =
      normalizeRequestTitle(persistedThread?.data.requestTitle) ??
      finalizedRequestMetadata.requestTitle;
    state.conventionalTitle =
      normalizeConventionalTitleMetadata(persistedThread?.data.conventionalTitle) ??
      finalizedRequestMetadata.conventionalTitle;
  }

  const step =
    persistedPlannerStep ??
    createPlannerStep({
      agentName: plannerRoleName,
      deliverable: plannerResponse.handoff.deliverable,
    });
  if (!persistedPlannerStep) {
    await appendTeamExecutionStep({
      threadFile,
      threadId,
      state,
      step,
    });
  }

  const result = buildPlanningResult({
    threadId,
    state,
    selectedRepository,
    requestMetadata: finalizedRequestMetadata,
    step,
  });

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

export const isPlanningMachineState = (
  state: TeamRunPlanningStageState | TeamRunMetadataGenerationStageState | { stage: string },
): state is TeamRunPlanningStageState | TeamRunMetadataGenerationStageState => {
  return state.stage === "planning" || state.stage === "metadata-generation";
};

export const handlePlanningStageError = async ({
  env,
  currentState,
  error,
}: {
  env: TeamRunEnv;
  currentState: TeamRunPlanningStageState | TeamRunMetadataGenerationStageState;
  error: unknown;
}): Promise<void> => {
  const threadFile = getTeamThreadFile();
  const { threadId, state } = currentState.context;
  const forwardPlannerEvent = createPlannerEventForwarder({
    env,
    threadId,
    assignmentNumber: state.assignmentNumber,
  });

  if (error instanceof ExistingBranchesRequireDeleteError) {
    try {
      await updateTeamThreadRecord({
        threadFile,
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
