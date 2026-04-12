import "server-only";

import { teamConfig } from "@/team.config";
import { formatCommitActivityReference } from "@/lib/team/activity-markdown";
import { applyHandoff, type TeamRoleState } from "@/lib/team/agent-helpers";
import {
  commitWorktreeChanges,
  createOrUpdateGitHubPullRequest,
  detectBranchConflict,
  getBranchHead,
  hasWorktreeChanges,
  inspectOpenSpecChangeArchiveState,
  listExistingBranches,
  resolveRepositoryBaseBranch,
  tryRebaseWorktreeBranch,
} from "@/lib/git/ops";
import type { TeamRepositoryContext, TeamRepositoryOption } from "@/lib/git/repository";
import {
  buildCanonicalBranchName,
  buildLaneBranchName,
  buildLaneWorktreePath,
  buildPlannerWorktreePath,
  deleteManagedBranches,
  ensureLaneWorktree,
  ExistingBranchesRequireDeleteError,
  parseManagedWorktreeSlot,
  pushLaneBranch,
  resolveWorktreeRoot,
} from "@/lib/team/git";
import {
  appendTeamExecutionStep,
  countActiveDispatchThreads,
  getTeamThreadRecord,
  listPendingDispatchAssignments,
  synchronizeDispatchAssignment,
  type PendingDispatchAssignment,
  updateTeamThreadRecord,
  upsertTeamThreadRun,
} from "@/lib/team/history";
import { appendTeamCodexLogEvent } from "@/lib/team/logs";
import {
  buildProposalChangeName,
  buildProposalPath,
  materializeAssignmentProposals,
} from "@/lib/team/openspec";
import {
  buildCanonicalRequestTitle,
  buildDeterministicRequestTitle,
  buildLanePullRequestTitle,
  describeConventionalTitleMetadata,
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
import { coderRole } from "@/lib/team/roles/coder";
import { plannerRole } from "@/lib/team/roles/planner";
import { reviewerRole } from "@/lib/team/roles/reviewer";
import type {
  TeamCodexEvent,
  TeamCodexLogEntry,
  TeamDispatchAssignment,
  TeamExecutionStep,
  TeamHumanFeedbackScope,
  TeamPlannerNote,
  TeamPullRequestRecord,
  TeamRoleHandoff,
  TeamWorkerEventActor,
  TeamWorkerLaneRecord,
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
type PersistedTeamThread = NonNullable<Awaited<ReturnType<typeof getTeamThreadRecord>>>;

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

type DispatchTask = {
  title: string;
  objective: string;
};

type LanePullRequestDraft = {
  title: string;
  summary: string;
};

type LaneRunState = TeamRoleState &
  TeamRepositoryContext & {
    teamName: string;
    ownerName: string;
    objective: string;
    laneId: string;
    laneIndex: number;
    executionPhase: TeamWorkerLaneRecord["executionPhase"];
    taskTitle: string;
    taskObjective: string;
    requestTitle: string;
    conventionalTitle: TeamDispatchAssignment["conventionalTitle"];
    planSummary: string;
    planDeliverable: string;
    conflictNote: string | null;
    archiveCommand: string | null;
    archivePathContext: string | null;
    pullRequestDraft: LanePullRequestDraft | null;
  };

export class DispatchThreadCapacityError extends Error {
  workerCount: number;

  constructor(workerCount: number) {
    super(
      `All ${workerCount} shared meow worktree slot${workerCount === 1 ? " is" : "s are"} already assigned to non-terminal threads. Wait for an active request group to finish before starting a new one.`,
    );
    this.name = "DispatchThreadCapacityError";
    this.workerCount = workerCount;
  }
}

export class TeamThreadReplanError extends Error {
  readonly code: "not_found" | "archived" | "superseded" | "active_queue";
  readonly statusCode: 404 | 409;

  constructor(
    code: "not_found" | "archived" | "superseded" | "active_queue",
    message: string,
    statusCode: 404 | 409,
  ) {
    super(message);
    this.name = "TeamThreadReplanError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const activeLaneRuns = new Map<string, Promise<void>>();
let plannerDispatchQueue = Promise.resolve();

const queuePlannerDispatchMaterialization = async <T>(task: () => Promise<T>): Promise<T> => {
  const queuedTask = plannerDispatchQueue.catch(() => undefined).then(task);
  plannerDispatchQueue = queuedTask.then(
    () => undefined,
    () => undefined,
  );
  return queuedTask;
};

const laneRunKey = (threadId: string, assignmentNumber: number, laneId: string): string => {
  return `${threadId}:${assignmentNumber}:${laneId}`;
};

const createLaneEvent = (actor: TeamWorkerEventActor, message: string, createdAt: string) => {
  return {
    id: crypto.randomUUID(),
    actor,
    message,
    createdAt,
  };
};

const createPlannerNote = (message: string, createdAt: string): TeamPlannerNote => {
  return {
    id: crypto.randomUUID(),
    message,
    createdAt,
  };
};

const createHumanFeedback = ({
  scope,
  laneId,
  message,
  createdAt,
}: {
  scope: TeamHumanFeedbackScope;
  laneId: string | null;
  message: string;
  createdAt: string;
}) => {
  return {
    id: crypto.randomUUID(),
    scope,
    laneId,
    message,
    createdAt,
  };
};

const findAssignment = (
  dispatchAssignments: TeamDispatchAssignment[],
  assignmentNumber: number,
): TeamDispatchAssignment => {
  const assignment = dispatchAssignments.find(
    (candidate) => candidate.assignmentNumber === assignmentNumber,
  );

  if (!assignment) {
    throw new Error(`Assignment #${assignmentNumber} was not found.`);
  }

  return assignment;
};

const findLane = (assignment: TeamDispatchAssignment, laneId: string): TeamWorkerLaneRecord => {
  const lane = assignment.lanes.find((candidate) => candidate.laneId === laneId);
  if (!lane) {
    throw new Error(`Lane ${laneId} was not found in assignment #${assignment.assignmentNumber}.`);
  }

  return lane;
};

const appendPlannerNote = (
  assignment: TeamDispatchAssignment,
  message: string,
  now: string,
): void => {
  assignment.plannerNotes = [...assignment.plannerNotes, createPlannerNote(message, now)];
};

const appendLaneEvent = (
  lane: TeamWorkerLaneRecord,
  actor: TeamWorkerEventActor,
  message: string,
  now: string,
): void => {
  lane.events = [...lane.events, createLaneEvent(actor, message, now)];
};

const getLaneWorkflow = (): string[] => {
  return teamConfig.workflow.filter((roleId) => roleId === "coder" || roleId === "reviewer");
};

const isFinalArchivePhase = (
  lane: Pick<TeamWorkerLaneRecord, "executionPhase">,
): lane is Pick<TeamWorkerLaneRecord, "executionPhase"> & { executionPhase: "final_archive" } => {
  return lane.executionPhase === "final_archive";
};

const getHighestHandoffSequence = (handoffs: Partial<Record<string, TeamRoleHandoff>>): number => {
  return Object.values(handoffs).reduce((highestSequence, handoff) => {
    return handoff ? Math.max(highestSequence, handoff.sequence) : highestSequence;
  }, 0);
};

const inferReviewerDecisionFromLane = (
  lane: Pick<
    TeamWorkerLaneRecord,
    "latestDecision" | "latestReviewerSummary" | "requeueReason" | "status" | "updatedAt"
  >,
): TeamRoleHandoff["decision"] | null => {
  if (!lane.latestReviewerSummary) {
    return null;
  }

  if (lane.requeueReason === "reviewer_requested_changes") {
    return "needs_revision";
  }

  if (lane.requeueReason === "planner_detected_conflict" || lane.status === "approved") {
    return "approved";
  }

  if (lane.latestDecision === "approved" || lane.latestDecision === "needs_revision") {
    return lane.latestDecision;
  }

  return null;
};

const buildSyntheticReviewerHandoff = (
  lane: Pick<
    TeamWorkerLaneRecord,
    | "latestDecision"
    | "latestReviewerSummary"
    | "requeueReason"
    | "status"
    | "updatedAt"
    | "finishedAt"
  >,
  assignmentNumber: number,
  sequence: number,
): TeamRoleHandoff | null => {
  if (!lane.latestReviewerSummary) {
    return null;
  }

  const decision = inferReviewerDecisionFromLane(lane);
  if (!decision) {
    return null;
  }

  return {
    roleId: "reviewer",
    roleName: "Reviewer",
    summary: lane.latestReviewerSummary,
    deliverable: lane.latestReviewerSummary,
    decision,
    sequence,
    assignmentNumber,
    updatedAt: lane.finishedAt ?? lane.updatedAt,
  };
};

const buildLanePersistedHandoffs = ({
  lane,
  assignmentNumber,
}: {
  lane: TeamWorkerLaneRecord;
  assignmentNumber: number;
}): Partial<Record<string, TeamRoleHandoff>> => {
  const handoffs: Partial<Record<string, TeamRoleHandoff>> = {};

  if (lane.latestCoderHandoff) {
    handoffs.coder = lane.latestCoderHandoff;
  }

  const reviewerHandoff =
    lane.latestReviewerHandoff ??
    buildSyntheticReviewerHandoff(
      lane,
      assignmentNumber,
      Math.max((lane.latestCoderHandoff?.sequence ?? 0) + 1, 1),
    );

  if (reviewerHandoff) {
    handoffs.reviewer = reviewerHandoff;
  }

  return handoffs;
};

const buildLaneInitialState = ({
  repository,
  lane,
  assignment,
  workflow,
  handoffs,
}: {
  repository: TeamRepositoryOption;
  lane: TeamWorkerLaneRecord;
  assignment: TeamDispatchAssignment;
  workflow: string[];
  handoffs: Partial<Record<string, TeamRoleHandoff>>;
}): LaneRunState => {
  const archiveCommand =
    lane.executionPhase === "final_archive" && lane.proposalChangeName
      ? `/opsx:archive ${lane.proposalChangeName}`
      : null;

  return {
    teamName: teamConfig.name,
    ownerName: teamConfig.owner.name,
    objective: teamConfig.owner.objective,
    repository,
    laneId: lane.laneId,
    laneIndex: lane.laneIndex,
    executionPhase: lane.executionPhase ?? "implementation",
    taskTitle: lane.taskTitle ?? `Lane ${lane.laneIndex} task`,
    taskObjective:
      lane.taskObjective ?? assignment.plannerSummary ?? "Implement the assigned task.",
    requestTitle: assignment.requestTitle ?? lane.taskTitle ?? `Proposal ${lane.laneIndex}`,
    conventionalTitle: assignment.conventionalTitle ?? null,
    planSummary: assignment.plannerSummary ?? "No planner summary provided.",
    planDeliverable: assignment.plannerDeliverable ?? "No planner deliverable provided.",
    branchName: lane.branchName ?? `lane-${lane.laneIndex}`,
    baseBranch: lane.baseBranch ?? teamConfig.dispatch.baseBranch,
    worktreePath:
      lane.worktreePath ??
      resolveWorktreeRoot({
        repositoryPath: repository.path,
        worktreeRoot: teamConfig.dispatch.worktreeRoot,
      }),
    implementationCommit: lane.latestImplementationCommit,
    conflictNote:
      lane.requeueReason === "planner_detected_conflict"
        ? "Planner detected a pull request conflict. Resolve the branch and prepare it for review again."
        : null,
    archiveCommand,
    archivePathContext: lane.proposalPath,
    workflow,
    handoffs,
    handoffCounter: getHighestHandoffSequence(handoffs),
    assignmentNumber: assignment.assignmentNumber,
    pullRequestDraft: null,
  } as LaneRunState;
};

const buildCoderCommitMessage = ({
  lane,
}: {
  lane: Pick<
    TeamWorkerLaneRecord,
    "executionPhase" | "laneIndex" | "proposalChangeName" | "taskTitle" | "requeueReason"
  >;
}): string => {
  if (lane.executionPhase === "final_archive" && lane.proposalChangeName) {
    return `coder: archive ${lane.proposalChangeName}`;
  }

  const taskLabel = lane.taskTitle?.trim() || `proposal ${lane.laneIndex}`;

  if (lane.requeueReason === "reviewer_requested_changes") {
    return `coder: address review feedback for ${taskLabel}`;
  }

  if (lane.requeueReason === "planner_detected_conflict") {
    return `coder: resolve conflict for ${taskLabel}`;
  }

  return `coder: implement ${taskLabel}`;
};

const noBranchOutputMessage =
  "Coder completed without producing a new branch commit. The lane was stopped to avoid an infinite coder/reviewer loop.";

const buildFinalArchiveApprovalActivity = ({
  lane,
  isRetry,
  isResume,
}: {
  lane: Pick<TeamWorkerLaneRecord, "proposalPath">;
  isRetry: boolean;
  isResume: boolean;
}): string => {
  if (isRetry) {
    return lane.proposalPath?.startsWith("openspec/changes/archive/")
      ? "Retrying final approval for the archived OpenSpec change and GitHub PR refresh."
      : "Retrying final approval through the coder archive pass and GitHub PR refresh.";
  }

  if (isResume) {
    return lane.proposalPath?.startsWith("openspec/changes/archive/")
      ? "Resuming final approval for the archived OpenSpec change and GitHub PR refresh."
      : "Resuming final approval through the coder archive pass and GitHub PR refresh.";
  }

  return lane.proposalPath?.startsWith("openspec/changes/archive/")
    ? "Human approved the archived machine-reviewed branch. Refreshing the GitHub PR."
    : "Human approved the machine-reviewed branch. Queueing the coder archive pass before refreshing the GitHub PR.";
};

const buildFinalArchiveInput = ({
  lane,
}: {
  lane: Pick<TeamWorkerLaneRecord, "proposalChangeName" | "proposalPath">;
}): string => {
  if (!lane.proposalChangeName) {
    return "Complete the non-interactive final archive continuation for this approved proposal.";
  }

  const archiveCommand = `/opsx:archive ${lane.proposalChangeName}`;
  const archivePathContext = lane.proposalPath ?? `openspec/changes/${lane.proposalChangeName}`;

  return [
    "Complete the dedicated final archive continuation for an already machine-reviewed proposal.",
    `Run \`${archiveCommand}\`.`,
    "You are not in an interactive context. Do not ask the user to select a change or confirm archive decisions.",
    "If archive inspection finds unsynced delta specs, sync them before archiving.",
    "If the archive creates or exposes `TBD` placeholders, replace them before finishing.",
    `Archive path context: ${archivePathContext}.`,
    "Finish with the branch ready for system commit detection, roadmap archive linking, GitHub push, and GitHub PR refresh.",
  ].join("\n");
};

const summarizeGitFailure = (message: string): string => {
  return (
    message
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "Git operation failed."
  );
};

const countAssignedLaneTasks = (assignment: Pick<TeamDispatchAssignment, "lanes">): number => {
  return assignment.lanes.filter((lane) => lane.taskTitle || lane.taskObjective).length || 1;
};

const buildCanonicalLanePullRequestDraft = ({
  assignment,
  lane,
  summary,
}: {
  assignment: Pick<TeamDispatchAssignment, "conventionalTitle" | "lanes" | "requestTitle">;
  lane: Pick<TeamWorkerLaneRecord, "laneIndex" | "taskTitle">;
  summary: string;
}): LanePullRequestDraft => {
  return {
    title: buildLanePullRequestTitle({
      requestTitle: assignment.requestTitle,
      taskTitle: lane.taskTitle ?? `Proposal ${lane.laneIndex}`,
      taskCount: countAssignedLaneTasks(assignment),
      conventionalTitle: assignment.conventionalTitle,
    }),
    summary,
  };
};

const buildProposalApprovalPullRequestDraft = ({
  assignment,
  lane,
}: {
  assignment: Pick<TeamDispatchAssignment, "conventionalTitle" | "lanes" | "requestTitle"> &
    Pick<TeamDispatchAssignment, "plannerSummary">;
  lane: Pick<TeamWorkerLaneRecord, "laneIndex" | "taskObjective" | "taskTitle">;
}): LanePullRequestDraft => {
  const summary =
    lane.taskObjective?.trim() ||
    assignment.plannerSummary?.trim() ||
    `Proposal ${lane.laneIndex} is approved for implementation.`;

  return buildCanonicalLanePullRequestDraft({
    assignment,
    lane,
    summary,
  });
};

const createPullRequestRecord = ({
  threadId,
  assignmentNumber,
  lane,
  draft,
  now,
  provider = "local-ci",
  status = "awaiting_human_approval",
  requestedAt = now,
  humanApprovalRequestedAt = now,
  humanApprovedAt = null,
  machineReviewedAt = now,
  url = null,
}: {
  threadId: string;
  assignmentNumber: number;
  lane: TeamWorkerLaneRecord;
  draft: LanePullRequestDraft;
  now: string;
  provider?: TeamPullRequestRecord["provider"];
  status?: TeamPullRequestRecord["status"];
  requestedAt?: string;
  humanApprovalRequestedAt?: string | null;
  humanApprovedAt?: string | null;
  machineReviewedAt?: string | null;
  url?: string | null;
}): TeamPullRequestRecord => {
  return {
    id: `pr-${threadId.slice(0, 8)}-a${assignmentNumber}-lane-${lane.laneIndex}`,
    provider,
    title: draft.title,
    summary: draft.summary,
    branchName: lane.branchName ?? `lane-${lane.laneIndex}`,
    baseBranch: lane.baseBranch ?? teamConfig.dispatch.baseBranch,
    status,
    requestedAt,
    humanApprovalRequestedAt,
    humanApprovedAt,
    machineReviewedAt,
    updatedAt: now,
    url,
  };
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
    status: "awaiting_human_approval",
    executionPhase: null,
    taskTitle: task.title,
    taskObjective: task.objective,
    proposalChangeName,
    proposalPath: buildProposalPath(proposalChangeName),
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
    latestActivity: "Proposal is waiting for human approval before coding and review begin.",
    approvalRequestedAt: now,
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

export const createPlannerDispatchAssignment = async ({
  threadId,
  assignmentNumber,
  repository,
  requestTitle,
  conventionalTitle,
  requestText,
  plannerSummary,
  plannerDeliverable,
  branchPrefix,
  tasks,
  deleteExistingBranches = false,
}: {
  threadId: string;
  assignmentNumber: number;
  repository: TeamRepositoryOption | null;
  requestTitle: string;
  conventionalTitle: TeamDispatchAssignment["conventionalTitle"];
  requestText: string;
  plannerSummary: string;
  plannerDeliverable: string;
  branchPrefix: string;
  tasks: DispatchTask[];
  deleteExistingBranches?: boolean;
}): Promise<TeamDispatchAssignment> => {
  if (!repository) {
    throw new Error("Dispatching coder and reviewer lanes requires a selected repository.");
  }

  return queuePlannerDispatchMaterialization(async () => {
    const now = new Date().toISOString();
    const resolvedBaseBranch = await resolveRepositoryBaseBranch(
      repository.path,
      teamConfig.dispatch.baseBranch,
    );
    const resolvedWorktreeRoot = resolveWorktreeRoot({
      repositoryPath: repository.path,
      worktreeRoot: teamConfig.dispatch.worktreeRoot,
    });
    const canonicalBranchName = buildCanonicalBranchName({
      threadId,
      branchPrefix,
      assignmentNumber,
    });

    const assignment: TeamDispatchAssignment = synchronizeDispatchAssignment(
      {
        assignmentNumber,
        status: "planning",
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
            `Planner created ${tasks.length} proposal${tasks.length === 1 ? "" : "s"} and is waiting for human approval before the coding-review queue starts.`,
            now,
          ),
        ],
        humanFeedback: [],
        supersededAt: null,
        supersededReason: null,
      },
      now,
    );

    const pendingAssignments = await listPendingDispatchAssignments(teamConfig.storage.threadFile);
    assignPendingDispatchThreadSlots({
      pendingAssignments: [
        ...pendingAssignments,
        {
          threadId,
          assignment,
        },
      ],
      workerCount: teamConfig.dispatch.workerCount,
      resolveAssignmentWorktreeRoot: (pending) =>
        resolveWorktreeRoot({
          repositoryPath: pending.assignment.repository?.path ?? "",
          worktreeRoot: teamConfig.dispatch.worktreeRoot,
        }),
    });

    if (!assignment.threadSlot || !assignment.plannerWorktreePath) {
      throw new DispatchThreadCapacityError(teamConfig.dispatch.workerCount);
    }

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
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
        plannerWorktreePath: assignment.plannerWorktreePath,
        lanes: assignment.lanes,
      });

      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
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
        threadFile: teamConfig.storage.threadFile,
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

const isPoolOccupyingLaneStatus = (status: TeamWorkerLaneRecord["status"]): boolean => {
  return status === "queued" || status === "coding" || status === "reviewing";
};

type PendingDispatchLaneAllocation = {
  pending: PendingDispatchAssignment;
  lane: TeamWorkerLaneRecord;
  worktreeRoot: string;
};

type PendingDispatchAssignmentAllocation = {
  pending: PendingDispatchAssignment;
  worktreeRoot: string;
};

type AssignmentThreadSchedulingState = Pick<
  TeamDispatchAssignment,
  "status" | "threadSlot" | "plannerWorktreePath"
>;

type LanePoolSchedulingState = Pick<TeamWorkerLaneRecord, "status" | "workerSlot" | "worktreePath">;

type PlannedAssignmentThreadState = {
  expected: AssignmentThreadSchedulingState;
  planned: Pick<TeamDispatchAssignment, "threadSlot" | "plannerWorktreePath">;
};

type PlannedLanePoolState = {
  expected: LanePoolSchedulingState;
  planned: Pick<TeamWorkerLaneRecord, "workerSlot" | "worktreePath">;
};

const buildAssignmentThreadPoolStateKey = ({
  threadId,
  assignmentNumber,
}: {
  threadId: string;
  assignmentNumber: number;
}): string => {
  return `${threadId}:${assignmentNumber}`;
};

const buildLanePoolStateKey = ({
  threadId,
  assignmentNumber,
  laneId,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
}): string => {
  return `${threadId}:${assignmentNumber}:${laneId}`;
};

const captureAssignmentThreadSchedulingState = (
  assignment: TeamDispatchAssignment,
): AssignmentThreadSchedulingState => {
  return {
    status: assignment.status,
    threadSlot: assignment.threadSlot ?? null,
    plannerWorktreePath: assignment.plannerWorktreePath ?? null,
  };
};

const captureLanePoolSchedulingState = (lane: TeamWorkerLaneRecord): LanePoolSchedulingState => {
  return {
    status: lane.status,
    workerSlot: lane.workerSlot,
    worktreePath: lane.worktreePath,
  };
};

const assignmentThreadSchedulingStateMatches = (
  assignment: TeamDispatchAssignment,
  expected: AssignmentThreadSchedulingState,
): boolean => {
  return (
    assignment.status === expected.status &&
    (assignment.threadSlot ?? null) === expected.threadSlot &&
    (assignment.plannerWorktreePath ?? null) === expected.plannerWorktreePath
  );
};

const lanePoolSchedulingStateMatches = (
  lane: TeamWorkerLaneRecord,
  expected: LanePoolSchedulingState,
): boolean => {
  return (
    lane.status === expected.status &&
    lane.workerSlot === expected.workerSlot &&
    lane.worktreePath === expected.worktreePath
  );
};

const comparePendingDispatchAssignmentAllocation = (
  left: PendingDispatchAssignmentAllocation,
  right: PendingDispatchAssignmentAllocation,
): number => {
  const leftRequestedAt =
    left.pending.assignment.startedAt ??
    left.pending.assignment.requestedAt ??
    left.pending.assignment.updatedAt;
  const rightRequestedAt =
    right.pending.assignment.startedAt ??
    right.pending.assignment.requestedAt ??
    right.pending.assignment.updatedAt;

  return (
    leftRequestedAt.localeCompare(rightRequestedAt) ||
    left.pending.threadId.localeCompare(right.pending.threadId) ||
    left.pending.assignment.assignmentNumber - right.pending.assignment.assignmentNumber
  );
};

const comparePendingDispatchLaneAllocation = (
  left: PendingDispatchLaneAllocation,
  right: PendingDispatchLaneAllocation,
): number => {
  const leftQueuedAt = left.lane.queuedAt ?? left.lane.updatedAt;
  const rightQueuedAt = right.lane.queuedAt ?? right.lane.updatedAt;

  return (
    leftQueuedAt.localeCompare(rightQueuedAt) ||
    left.pending.threadId.localeCompare(right.pending.threadId) ||
    left.pending.assignment.assignmentNumber - right.pending.assignment.assignmentNumber ||
    left.lane.laneIndex - right.lane.laneIndex
  );
};

const applyAssignmentThreadSlot = ({
  assignment,
  worktreeRoot,
  threadSlot,
}: {
  assignment: TeamDispatchAssignment;
  worktreeRoot: string;
  threadSlot: number | null;
}): void => {
  assignment.threadSlot = threadSlot;
  assignment.plannerWorktreePath = threadSlot
    ? buildPlannerWorktreePath({
        worktreeRoot,
        threadSlot,
      })
    : null;
};

const resolvePreservedAssignmentThreadSlot = ({
  assignment,
  worktreeRoot,
}: {
  assignment: TeamDispatchAssignment;
  worktreeRoot: string;
}): number | null => {
  if (assignment.threadSlot) {
    return assignment.threadSlot;
  }

  if (assignment.plannerWorktreePath) {
    const plannerSlot = parseManagedWorktreeSlot({
      worktreeRoot,
      worktreePath: assignment.plannerWorktreePath,
    });
    if (plannerSlot) {
      return plannerSlot;
    }
  }

  for (const lane of assignment.lanes) {
    if (!isPoolOccupyingLaneStatus(lane.status)) {
      continue;
    }

    if (lane.workerSlot) {
      return lane.workerSlot;
    }

    if (!lane.worktreePath) {
      continue;
    }

    const laneSlot = parseManagedWorktreeSlot({
      worktreeRoot,
      worktreePath: lane.worktreePath,
    });
    if (laneSlot) {
      return laneSlot;
    }
  }

  return null;
};

export const assignPendingDispatchThreadSlots = ({
  pendingAssignments,
  workerCount,
  resolveAssignmentWorktreeRoot,
}: {
  pendingAssignments: PendingDispatchAssignment[];
  workerCount: number;
  resolveAssignmentWorktreeRoot: (pending: PendingDispatchAssignment) => string;
}): void => {
  const occupiedSlots = new Set<number>();
  let preservedAssignmentCount = 0;
  const unassignedAssignments: PendingDispatchAssignmentAllocation[] = [];

  for (const pending of pendingAssignments) {
    if (!pending.assignment.repository) {
      continue;
    }

    const worktreeRoot = resolveAssignmentWorktreeRoot(pending);
    const preservedThreadSlot = resolvePreservedAssignmentThreadSlot({
      assignment: pending.assignment,
      worktreeRoot,
    });

    if (!preservedThreadSlot) {
      applyAssignmentThreadSlot({
        assignment: pending.assignment,
        worktreeRoot,
        threadSlot: null,
      });
      unassignedAssignments.push({
        pending,
        worktreeRoot,
      });
      continue;
    }

    preservedAssignmentCount += 1;
    if (preservedThreadSlot >= 1 && preservedThreadSlot <= workerCount) {
      occupiedSlots.add(preservedThreadSlot);
    }
    applyAssignmentThreadSlot({
      assignment: pending.assignment,
      worktreeRoot,
      threadSlot: preservedThreadSlot,
    });
  }

  const remainingCapacity = Math.max(0, workerCount - preservedAssignmentCount);
  const availableSlots = Array.from({ length: workerCount }, (_, index) => index + 1)
    .filter((slot) => !occupiedSlots.has(slot))
    .slice(0, remainingCapacity);

  for (const { pending, worktreeRoot } of unassignedAssignments.sort(
    comparePendingDispatchAssignmentAllocation,
  )) {
    const threadSlot = availableSlots.shift();
    if (!threadSlot) {
      break;
    }

    applyAssignmentThreadSlot({
      assignment: pending.assignment,
      worktreeRoot,
      threadSlot,
    });
  }
};

export const assignPendingDispatchWorkerSlots = ({
  pendingAssignments,
  resolveAssignmentWorktreeRoot,
}: {
  pendingAssignments: PendingDispatchAssignment[];
  resolveAssignmentWorktreeRoot: (pending: PendingDispatchAssignment) => string;
}): void => {
  for (const pending of pendingAssignments) {
    if (!pending.assignment.repository) {
      continue;
    }

    const worktreeRoot = resolveAssignmentWorktreeRoot(pending);
    let hasAssignedLane = false;
    const slotlessQueuedLanes: PendingDispatchLaneAllocation[] = [];

    for (const lane of pending.assignment.lanes) {
      if (!isPoolOccupyingLaneStatus(lane.status)) {
        continue;
      }

      const preservedLaneSlot =
        lane.workerSlot ??
        (lane.worktreePath
          ? parseManagedWorktreeSlot({
              worktreeRoot,
              worktreePath: lane.worktreePath,
            })
          : null);

      if (preservedLaneSlot) {
        lane.workerSlot = preservedLaneSlot;
        lane.worktreePath ??= buildLaneWorktreePath({
          worktreeRoot,
          laneIndex: preservedLaneSlot,
        });
        hasAssignedLane = true;
        continue;
      }

      if (lane.status === "queued") {
        lane.workerSlot = null;
        lane.worktreePath = null;
        slotlessQueuedLanes.push({
          pending,
          lane,
          worktreeRoot,
        });
      }
    }

    if (hasAssignedLane) {
      continue;
    }

    const threadSlot = pending.assignment.threadSlot ?? null;
    if (!threadSlot || threadSlot < 1) {
      continue;
    }

    const nextQueuedLane = slotlessQueuedLanes.sort(comparePendingDispatchLaneAllocation)[0];
    if (!nextQueuedLane) {
      continue;
    }

    nextQueuedLane.lane.workerSlot = threadSlot;
    nextQueuedLane.lane.worktreePath =
      pending.assignment.plannerWorktreePath ??
      buildLaneWorktreePath({
        worktreeRoot,
        laneIndex: threadSlot,
      });
  }
};

const runFinalArchiveCycle = async ({
  threadId,
  assignmentNumber,
  laneId,
  dependencies,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  dependencies: TeamRoleDependencies;
}): Promise<void> => {
  const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
  if (!thread) {
    return;
  }

  const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
  const lane = findLane(assignment, laneId);

  if (
    !assignment.repository ||
    !lane.worktreePath ||
    !lane.branchName ||
    !lane.baseBranch ||
    !lane.proposalChangeName ||
    !lane.pullRequest
  ) {
    throw new Error("Final archive lane is missing repository, branch, or OpenSpec metadata.");
  }

  const repositoryPath = assignment.repository.path;
  const laneBranchName = lane.branchName;
  const pullRequestSummary =
    lane.pullRequest.summary?.trim() ||
    lane.latestReviewerSummary?.trim() ||
    `Proposal ${lane.laneIndex} passed machine review.`;
  const pullRequestTitle =
    lane.pullRequest.title?.trim() ||
    buildCanonicalLanePullRequestDraft({
      assignment,
      lane,
      summary: pullRequestSummary,
    }).title;
  const humanApprovedAt = lane.pullRequest.humanApprovedAt ?? new Date().toISOString();
  let latestImplementationCommit = lane.latestImplementationCommit;
  let updatedPushedCommit = lane.pushedCommit;
  let archivedProposalPath = lane.proposalPath;
  let archivePersistedToBranch =
    lane.proposalPath?.startsWith("openspec/changes/archive/") ?? false;
  let coderHandoff: TeamRoleHandoff | null = null;
  let coderArchivedThisRun = false;
  const refreshLatestImplementationCommit = async (): Promise<string> => {
    latestImplementationCommit = await getBranchHead({
      repositoryPath,
      branchName: laneBranchName,
    });

    return latestImplementationCommit;
  };

  try {
    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        mutableLane.status = "coding";
        mutableLane.executionPhase = "final_archive";
        mutableLane.lastError = null;
        mutableLane.startedAt = mutableLane.startedAt ?? now;
        mutableLane.finishedAt = null;
        mutableLane.latestActivity = mutableLane.proposalPath?.startsWith(
          "openspec/changes/archive/",
        )
          ? "Final approval is refreshing GitHub delivery for the archived OpenSpec change."
          : `Coder is running non-interactive /opsx:archive ${mutableLane.proposalChangeName} for final approval.`;
        mutableLane.updatedAt = now;
        appendLaneEvent(mutableLane, "system", mutableLane.latestActivity, now);
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });

    await ensureLaneWorktree({
      repositoryPath: assignment.repository.path,
      worktreeRoot: resolveWorktreeRoot({
        repositoryPath: assignment.repository.path,
        worktreeRoot: teamConfig.dispatch.worktreeRoot,
      }),
      worktreePath: lane.worktreePath,
      branchName: lane.branchName,
      startPoint: lane.latestImplementationCommit ?? lane.baseBranch,
    });

    const preArchiveState = await inspectOpenSpecChangeArchiveState({
      worktreePath: lane.worktreePath,
      changeName: lane.proposalChangeName,
    });

    if (preArchiveState.sourceExists && preArchiveState.archivedPath) {
      throw new Error(
        `OpenSpec change ${lane.proposalChangeName} exists in both active and archived paths.`,
      );
    }

    if (preArchiveState.sourceExists) {
      const coderState = buildLaneInitialState({
        repository: assignment.repository,
        lane,
        assignment,
        workflow: getLaneWorkflow(),
        handoffs: buildLanePersistedHandoffs({
          lane,
          assignmentNumber,
        }),
      });
      const coderResponse = await dependencies.coderAgent.run({
        state: coderState,
        input: buildFinalArchiveInput({
          lane,
        }),
        onEvent: async (event) => {
          await appendTeamCodexLogEvent({
            threadFile: teamConfig.storage.threadFile,
            threadId,
            assignmentNumber,
            roleId: coderRole.id,
            laneId,
            event,
          });
        },
      });

      coderHandoff = applyHandoff({
        state: coderState,
        role: coderRole,
        summary: coderResponse.summary,
        deliverable: coderResponse.deliverable,
        decision: coderResponse.decision,
      });

      if (await hasWorktreeChanges(lane.worktreePath)) {
        await commitWorktreeChanges({
          worktreePath: lane.worktreePath,
          message: buildCoderCommitMessage({
            lane,
          }),
        });
      }

      const postArchiveState = await inspectOpenSpecChangeArchiveState({
        worktreePath: lane.worktreePath,
        changeName: lane.proposalChangeName,
      });

      if (postArchiveState.sourceExists || !postArchiveState.archivedPath) {
        throw new Error(
          `Final archive coder pass did not archive OpenSpec change ${lane.proposalChangeName}.`,
        );
      }

      archivedProposalPath = postArchiveState.archivedPath;
      archivePersistedToBranch = true;
      coderArchivedThisRun = true;
    } else if (preArchiveState.archivedPath) {
      archivedProposalPath = preArchiveState.archivedPath;
      archivePersistedToBranch = true;
    } else {
      throw new Error(
        `OpenSpec change ${lane.proposalChangeName} was not found in the active or archived OpenSpec directories.`,
      );
    }

    await refreshLatestImplementationCommit();

    updatedPushedCommit = latestImplementationCommit
      ? await pushLaneBranch({
          repositoryPath: assignment.repository.path,
          branchName: lane.branchName,
          commitHash: latestImplementationCommit,
        })
      : null;

    if (!latestImplementationCommit || !updatedPushedCommit) {
      throw new Error(
        "Final approval could not resolve the archived branch head for GitHub delivery.",
      );
    }

    const finalizedCommitHash = latestImplementationCommit;
    const finalizedPushedCommit = updatedPushedCommit;

    const gitHubPullRequest = await createOrUpdateGitHubPullRequest({
      repositoryPath: lane.worktreePath,
      branchName: lane.branchName,
      baseBranch: lane.baseBranch,
      title: pullRequestTitle,
      body: pullRequestSummary,
      draft: false,
    });

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        const mutablePullRequest = mutableLane.pullRequest;

        if (!mutablePullRequest) {
          throw new Error("This reviewed branch no longer has pull request metadata.");
        }

        mutableLane.status = "approved";
        mutableLane.executionPhase = null;
        mutableLane.proposalPath = archivedProposalPath;
        mutableLane.latestImplementationCommit = finalizedCommitHash;
        mutableLane.pushedCommit = finalizedPushedCommit;
        if (coderHandoff) {
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
        }
        mutableLane.latestActivity =
          "Human approval finalized the machine-reviewed branch, archived the OpenSpec change, and refreshed the GitHub PR.";
        mutableLane.lastError = null;
        mutableLane.workerSlot = null;
        mutableLane.requeueReason = null;
        mutableLane.pullRequest = {
          ...mutablePullRequest,
          provider: "github",
          title: pullRequestTitle,
          summary: pullRequestSummary,
          status: "approved",
          humanApprovedAt,
          updatedAt: now,
          url: gitHubPullRequest.url,
        };
        mutableLane.updatedAt = now;
        mutableLane.finishedAt = now;
        if (coderHandoff) {
          appendLaneEvent(
            mutableLane,
            "coder",
            `Coder completed final archive pass: ${coderHandoff.summary}`,
            now,
          );
        }
        appendLaneEvent(
          mutableLane,
          "system",
          coderArchivedThisRun || archivedProposalPath !== lane.proposalPath
            ? `Archived OpenSpec change to ${archivedProposalPath} and pushed commit ${formatCommitActivityReference(
                {
                  commitHash: finalizedCommitHash,
                  commitUrl: finalizedPushedCommit.commitUrl,
                },
              )} to GitHub via ${finalizedPushedCommit.remoteName}.`
            : `Verified archived OpenSpec change at ${archivedProposalPath} and refreshed commit ${formatCommitActivityReference(
                {
                  commitHash: finalizedCommitHash,
                  commitUrl: finalizedPushedCommit.commitUrl,
                },
              )} on GitHub via ${finalizedPushedCommit.remoteName}.`,
          now,
        );
        appendLaneEvent(
          mutableLane,
          "system",
          `GitHub PR refreshed: ${gitHubPullRequest.url}`,
          now,
        );
        appendPlannerNote(
          mutableAssignment,
          `Human approved proposal ${mutableLane.laneIndex}; ${archivedProposalPath} is archived on ${mutableLane.branchName ?? lane.branchName}, and the GitHub PR was refreshed at ${gitHubPullRequest.url}.`,
          now,
        );
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });
  } catch (error) {
    const errorSummary = summarizeGitFailure(
      error instanceof Error ? error.message : "GitHub PR finalization failed.",
    );

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        const mutablePullRequest = mutableLane.pullRequest;

        if (!mutablePullRequest) {
          throw new Error("This reviewed branch no longer has pull request metadata.");
        }

        mutableLane.status = "approved";
        mutableLane.executionPhase = null;
        if (archivePersistedToBranch) {
          mutableLane.proposalPath = archivedProposalPath;
        }
        mutableLane.latestImplementationCommit = latestImplementationCommit;
        mutableLane.pushedCommit = updatedPushedCommit;
        if (coderHandoff) {
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
        }
        mutableLane.latestActivity = archivePersistedToBranch
          ? "Final human approval archived the OpenSpec change, but the GitHub PR refresh did not complete."
          : "Final human approval failed before the coder archive pass and GitHub PR refresh could complete.";
        mutableLane.lastError = errorSummary;
        mutableLane.workerSlot = null;
        mutableLane.requeueReason = null;
        mutableLane.pullRequest = {
          ...mutablePullRequest,
          title: pullRequestTitle,
          summary: pullRequestSummary,
          status: "failed",
          humanApprovedAt,
          updatedAt: now,
        };
        mutableLane.updatedAt = now;
        mutableLane.finishedAt = now;
        if (coderHandoff) {
          appendLaneEvent(
            mutableLane,
            "coder",
            `Coder completed final archive pass: ${coderHandoff.summary}`,
            now,
          );
        }
        appendLaneEvent(mutableLane, "system", errorSummary, now);
        appendPlannerNote(
          mutableAssignment,
          archivePersistedToBranch &&
            archivedProposalPath &&
            archivedProposalPath !== lane.proposalPath
            ? `Final approval for proposal ${mutableLane.laneIndex} failed after archiving ${archivedProposalPath}: ${errorSummary}`
            : `Final approval for proposal ${mutableLane.laneIndex} failed: ${errorSummary}`,
          now,
        );
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });

    await appendTeamCodexLogEvent({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      assignmentNumber,
      roleId: null,
      laneId,
      event: {
        source: "system",
        message: errorSummary,
        createdAt: new Date().toISOString(),
      },
    });
  }
};

const runLaneCycle = async ({
  threadId,
  assignmentNumber,
  laneId,
  dependencies,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  dependencies: TeamRoleDependencies;
}): Promise<void> => {
  while (true) {
    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
    if (!thread) {
      return;
    }

    const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
    const lane = findLane(assignment, laneId);
    if (lane.status !== "queued" && lane.status !== "coding" && lane.status !== "reviewing") {
      return;
    }

    if (!lane.workerSlot || !lane.worktreePath) {
      return;
    }

    if (!assignment.repository || !lane.worktreePath || !lane.branchName || !lane.baseBranch) {
      throw new Error("Lane is missing repository, branch, or worktree metadata.");
    }

    if (isFinalArchivePhase(lane)) {
      await runFinalArchiveCycle({
        threadId,
        assignmentNumber,
        laneId,
        dependencies,
      });
      return;
    }

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        mutableLane.status = "coding";
        mutableLane.executionPhase ??= "implementation";
        mutableLane.lastError = null;
        mutableLane.latestImplementationCommit = null;
        mutableLane.pushedCommit = null;
        mutableLane.startedAt = mutableLane.startedAt ?? now;
        mutableLane.finishedAt = null;
        mutableLane.latestActivity =
          mutableLane.requeueReason === "planner_detected_conflict"
            ? "Coder is resolving a planner-detected pull request conflict."
            : mutableLane.requeueReason === "reviewer_requested_changes"
              ? "Coder is addressing reviewer-requested changes."
              : "Coder is implementing the approved proposal in the dedicated worktree.";
        mutableLane.updatedAt = now;
        appendLaneEvent(mutableLane, "coder", mutableLane.latestActivity, now);
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });

    await ensureLaneWorktree({
      repositoryPath: assignment.repository.path,
      worktreeRoot: resolveWorktreeRoot({
        repositoryPath: assignment.repository.path,
        worktreeRoot: teamConfig.dispatch.worktreeRoot,
      }),
      worktreePath: lane.worktreePath,
      branchName: lane.branchName,
      startPoint: assignment.canonicalBranchName ?? lane.baseBranch,
    });

    const branchHeadBeforeCoding = await getBranchHead({
      repositoryPath: assignment.repository.path,
      branchName: lane.branchName,
    });

    const coderState = buildLaneInitialState({
      repository: assignment.repository,
      lane,
      assignment,
      workflow: getLaneWorkflow(),
      handoffs: buildLanePersistedHandoffs({
        lane,
        assignmentNumber,
      }),
    });
    const coderResponse = await dependencies.coderAgent.run({
      state: coderState,
      input:
        lane.taskObjective ?? lane.taskTitle ?? assignment.plannerSummary ?? "Implement the task.",
      onEvent: async (event) => {
        await appendTeamCodexLogEvent({
          threadFile: teamConfig.storage.threadFile,
          threadId,
          assignmentNumber,
          roleId: coderRole.id,
          laneId,
          event,
        });
      },
    });

    const coderHandoff = applyHandoff({
      state: coderState,
      role: coderRole,
      summary: coderResponse.summary,
      deliverable: coderResponse.deliverable,
      decision: coderResponse.decision,
    });

    if (await hasWorktreeChanges(lane.worktreePath)) {
      await commitWorktreeChanges({
        worktreePath: lane.worktreePath,
        message: buildCoderCommitMessage({
          lane,
        }),
      });
    }

    const branchHeadAfterCoding = await getBranchHead({
      repositoryPath: assignment.repository.path,
      branchName: lane.branchName,
    });

    if (branchHeadAfterCoding === branchHeadBeforeCoding) {
      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (mutableThread, now) => {
          const mutableAssignment = findAssignment(
            mutableThread.dispatchAssignments,
            assignmentNumber,
          );
          const mutableLane = findLane(mutableAssignment, laneId);
          mutableLane.status = "failed";
          mutableLane.executionPhase = null;
          mutableLane.latestImplementationCommit = null;
          mutableLane.pushedCommit = null;
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
          mutableLane.latestDecision = coderHandoff.decision;
          mutableLane.latestActivity = "Coder finished without producing branch output.";
          mutableLane.lastError = noBranchOutputMessage;
          mutableLane.runCount += 1;
          mutableLane.workerSlot = null;
          mutableLane.worktreePath = null;
          if (mutableLane.pullRequest) {
            mutableLane.pullRequest = {
              ...mutableLane.pullRequest,
              status: "failed",
              updatedAt: now,
            };
          }
          mutableLane.updatedAt = now;
          mutableLane.finishedAt = now;
          appendLaneEvent(mutableLane, "coder", `Coder handoff: ${coderHandoff.summary}`, now);
          appendLaneEvent(mutableLane, "system", noBranchOutputMessage, now);
          appendPlannerNote(
            mutableAssignment,
            `Lane ${mutableLane.laneIndex} stopped because the coder produced no branch output.`,
            now,
          );
          synchronizeDispatchAssignment(mutableAssignment, now);
        },
      });

      await appendTeamCodexLogEvent({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        assignmentNumber,
        roleId: coderRole.id,
        laneId,
        event: {
          source: "system",
          message: noBranchOutputMessage,
          createdAt: new Date().toISOString(),
        },
      });

      return;
    }

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        const reviewCommit = formatCommitActivityReference({
          commitHash: branchHeadAfterCoding,
        });
        mutableLane.status = "reviewing";
        mutableLane.executionPhase = "implementation";
        mutableLane.latestImplementationCommit = branchHeadAfterCoding;
        mutableLane.pushedCommit = null;
        mutableLane.latestCoderHandoff = coderHandoff;
        mutableLane.latestCoderSummary = coderHandoff.summary;
        mutableLane.latestDecision = coderHandoff.decision;
        mutableLane.latestActivity = `Reviewer is evaluating implementation commit ${reviewCommit}.`;
        mutableLane.updatedAt = now;
        appendLaneEvent(
          mutableLane,
          "coder",
          `Coder requested review for commit ${reviewCommit}: ${coderHandoff.summary}`,
          now,
        );
        appendLaneEvent(mutableLane, "reviewer", mutableLane.latestActivity, now);
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });

    const reviewerLane: TeamWorkerLaneRecord = {
      ...lane,
      status: "reviewing",
      executionPhase: "implementation",
      latestImplementationCommit: branchHeadAfterCoding,
      pushedCommit: null,
      latestCoderHandoff: coderHandoff,
      latestCoderSummary: coderHandoff.summary,
      latestDecision: coderHandoff.decision,
    };

    const reviewerState = buildLaneInitialState({
      repository: assignment.repository,
      lane: reviewerLane,
      assignment,
      workflow: getLaneWorkflow(),
      handoffs: {
        ...buildLanePersistedHandoffs({
          lane: reviewerLane,
          assignmentNumber,
        }),
        coder: coderHandoff,
      },
    });
    const reviewerResponse = await dependencies.reviewerAgent.run({
      state: reviewerState,
      input:
        lane.taskObjective ??
        lane.taskTitle ??
        assignment.plannerSummary ??
        "Review the lane output.",
      onEvent: async (event) => {
        await appendTeamCodexLogEvent({
          threadFile: teamConfig.storage.threadFile,
          threadId,
          assignmentNumber,
          roleId: reviewerRole.id,
          laneId,
          event,
        });
      },
    });
    const reviewerHandoff = applyHandoff({
      state: reviewerState,
      role: reviewerRole,
      summary: reviewerResponse.summary,
      deliverable: reviewerResponse.deliverable,
      decision: reviewerResponse.decision,
    });
    reviewerState.pullRequestDraft =
      reviewerResponse.pullRequestTitle && reviewerResponse.pullRequestSummary
        ? buildCanonicalLanePullRequestDraft({
            assignment,
            lane,
            summary: reviewerResponse.pullRequestSummary,
          })
        : null;

    if (reviewerHandoff.decision === "needs_revision") {
      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (mutableThread, now) => {
          const mutableAssignment = findAssignment(
            mutableThread.dispatchAssignments,
            assignmentNumber,
          );
          const mutableLane = findLane(mutableAssignment, laneId);
          mutableLane.status = "queued";
          mutableLane.executionPhase = "implementation";
          mutableLane.pushedCommit = null;
          mutableLane.latestDecision = reviewerHandoff.decision;
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestReviewerHandoff = reviewerHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
          mutableLane.latestReviewerSummary = reviewerHandoff.summary;
          mutableLane.latestActivity =
            "Reviewer requested changes and returned the proposal to the coding-review queue.";
          mutableLane.runCount += 1;
          mutableLane.revisionCount += 1;
          mutableLane.queuedAt = now;
          mutableLane.requeueReason = "reviewer_requested_changes";
          mutableLane.updatedAt = now;
          mutableLane.finishedAt = null;
          appendLaneEvent(
            mutableLane,
            "reviewer",
            `Reviewer requested changes: ${reviewerHandoff.summary}`,
            now,
          );
          synchronizeDispatchAssignment(mutableAssignment, now);
        },
      });

      continue;
    }

    const now = new Date().toISOString();
    const reviewPullRequestDraft =
      reviewerState.pullRequestDraft ??
      buildCanonicalLanePullRequestDraft({
        assignment,
        lane,
        summary: reviewerHandoff.summary,
      });
    const trackingPullRequest =
      lane.pullRequest ??
      createPullRequestRecord({
        threadId,
        assignmentNumber,
        lane,
        draft: reviewPullRequestDraft,
        now,
        status: "draft",
        humanApprovalRequestedAt: null,
        machineReviewedAt: null,
      });

    const hasConflict = await detectBranchConflict({
      repositoryPath: assignment.repository.path,
      baseBranch: lane.baseBranch,
      branchName: lane.branchName,
    });

    let latestImplementationCommit = branchHeadAfterCoding;
    let rebaseErrorSummary: string | null = null;

    const rebaseAttempt = await tryRebaseWorktreeBranch({
      worktreePath: lane.worktreePath,
      baseBranch: lane.baseBranch,
    });

    if (rebaseAttempt.applied) {
      latestImplementationCommit = await getBranchHead({
        repositoryPath: assignment.repository.path,
        branchName: lane.branchName,
      });
    } else {
      rebaseErrorSummary = rebaseAttempt.error
        ? summarizeGitFailure(rebaseAttempt.error)
        : "Git rebase failed.";
    }

    const rebasedOntoBase = latestImplementationCommit !== branchHeadAfterCoding;
    const rebaseFailureActivity = hasConflict
      ? "Planner detected a pull request conflict and the auto-rebase attempt failed, so the proposal was requeued."
      : "Planner could not rebase the lane onto the base branch, so the proposal was requeued for conflict resolution.";
    const rebaseFailureReviewerEvent = hasConflict
      ? `Reviewer approved the proposal, but the planner auto-rebase attempt failed after detecting a conflict: ${reviewerHandoff.summary}`
      : `Reviewer approved the proposal, but the planner auto-rebase attempt onto ${lane.baseBranch} failed: ${reviewerHandoff.summary}`;
    const rebaseFailurePlannerNote = hasConflict
      ? `Conflict detected for proposal ${lane.laneIndex}; automatic rebase onto ${lane.baseBranch} failed (${rebaseErrorSummary}), so the coder was requeued before machine review could complete.`
      : `Proposal ${lane.laneIndex} passed machine review, but the automatic rebase onto ${lane.baseBranch} failed (${rebaseErrorSummary}), so the coder was requeued before machine review could complete.`;

    if (rebaseErrorSummary) {
      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (mutableThread, mutableNow) => {
          const mutableAssignment = findAssignment(
            mutableThread.dispatchAssignments,
            assignmentNumber,
          );
          const mutableLane = findLane(mutableAssignment, laneId);
          mutableLane.status = "queued";
          mutableLane.executionPhase = "implementation";
          mutableLane.pushedCommit = null;
          mutableLane.latestDecision = reviewerHandoff.decision;
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestReviewerHandoff = reviewerHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
          mutableLane.latestReviewerSummary = reviewerHandoff.summary;
          mutableLane.latestActivity = rebaseFailureActivity;
          mutableLane.runCount += 1;
          mutableLane.revisionCount += 1;
          mutableLane.queuedAt = mutableNow;
          mutableLane.requeueReason = "planner_detected_conflict";
          mutableLane.pullRequest = {
            ...trackingPullRequest,
            title: reviewPullRequestDraft.title,
            summary: reviewPullRequestDraft.summary,
            status: "conflict",
            updatedAt: mutableNow,
            humanApprovalRequestedAt: null,
            humanApprovedAt: null,
            machineReviewedAt: null,
          };
          mutableLane.updatedAt = mutableNow;
          mutableLane.finishedAt = null;
          appendLaneEvent(mutableLane, "reviewer", rebaseFailureReviewerEvent, mutableNow);
          appendPlannerNote(mutableAssignment, rebaseFailurePlannerNote, mutableNow);
          synchronizeDispatchAssignment(mutableAssignment, mutableNow);
        },
      });

      continue;
    }

    let pushedCommit: Awaited<ReturnType<typeof pushLaneBranch>> | null = null;
    try {
      pushedCommit = await pushLaneBranch({
        repositoryPath: assignment.repository.path,
        branchName: lane.branchName,
        commitHash: latestImplementationCommit,
      });
    } catch (error) {
      const pushErrorSummary = summarizeGitFailure(
        error instanceof Error ? error.message : "Git push failed.",
      );
      const pushErrorMessage = `GitHub push failed for ${lane.branchName}: ${pushErrorSummary}`;

      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (mutableThread, mutableNow) => {
          const mutableAssignment = findAssignment(
            mutableThread.dispatchAssignments,
            assignmentNumber,
          );
          const mutableLane = findLane(mutableAssignment, laneId);
          mutableLane.status = "failed";
          mutableLane.executionPhase = null;
          mutableLane.latestImplementationCommit = latestImplementationCommit;
          mutableLane.pushedCommit = null;
          mutableLane.latestDecision = reviewerHandoff.decision;
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestReviewerHandoff = reviewerHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
          mutableLane.latestReviewerSummary = reviewerHandoff.summary;
          mutableLane.latestActivity =
            "Machine review approved the proposal, but publishing the lane branch to GitHub failed.";
          mutableLane.runCount += 1;
          mutableLane.workerSlot = null;
          mutableLane.requeueReason = null;
          mutableLane.lastError = pushErrorMessage;
          mutableLane.pullRequest = {
            ...trackingPullRequest,
            title: reviewPullRequestDraft.title,
            summary: reviewPullRequestDraft.summary,
            status: "failed",
            humanApprovalRequestedAt: null,
            humanApprovedAt: null,
            updatedAt: mutableNow,
            machineReviewedAt: null,
          };
          mutableLane.updatedAt = mutableNow;
          mutableLane.finishedAt = mutableNow;
          if (rebasedOntoBase) {
            appendLaneEvent(
              mutableLane,
              "planner",
              `Planner rebased the lane onto ${mutableLane.baseBranch ?? lane.baseBranch} before final approval.`,
              mutableNow,
            );
          }
          appendLaneEvent(
            mutableLane,
            "reviewer",
            `Reviewer completed machine review: ${reviewerHandoff.summary}`,
            mutableNow,
          );
          appendLaneEvent(mutableLane, "system", pushErrorMessage, mutableNow);
          appendPlannerNote(
            mutableAssignment,
            rebasedOntoBase
              ? `Proposal ${mutableLane.laneIndex} was automatically rebased onto ${mutableLane.baseBranch ?? lane.baseBranch} after machine review, but publishing ${mutableLane.branchName ?? lane.branchName} to GitHub failed (${pushErrorSummary}).`
              : `Proposal ${mutableLane.laneIndex} passed machine review, but publishing ${mutableLane.branchName ?? lane.branchName} to GitHub failed (${pushErrorSummary}).`,
            mutableNow,
          );
          synchronizeDispatchAssignment(mutableAssignment, mutableNow);
        },
      });

      await appendTeamCodexLogEvent({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        assignmentNumber,
        roleId: null,
        laneId,
        event: {
          source: "system",
          message: pushErrorMessage,
          createdAt: new Date().toISOString(),
        },
      });

      return;
    }

    if (!pushedCommit) {
      return;
    }

    let gitHubPullRequest: Awaited<ReturnType<typeof createOrUpdateGitHubPullRequest>> | null =
      null;
    try {
      gitHubPullRequest = await createOrUpdateGitHubPullRequest({
        repositoryPath: lane.worktreePath,
        branchName: lane.branchName,
        baseBranch: lane.baseBranch,
        title: reviewPullRequestDraft.title,
        body: reviewPullRequestDraft.summary,
        draft: false,
      });
    } catch (error) {
      const pullRequestErrorSummary = summarizeGitFailure(
        error instanceof Error ? error.message : "GitHub pull request refresh failed.",
      );
      const pullRequestErrorMessage = `GitHub PR refresh failed for ${lane.branchName}: ${pullRequestErrorSummary}`;

      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (mutableThread, mutableNow) => {
          const mutableAssignment = findAssignment(
            mutableThread.dispatchAssignments,
            assignmentNumber,
          );
          const mutableLane = findLane(mutableAssignment, laneId);
          mutableLane.status = "approved";
          mutableLane.executionPhase = null;
          mutableLane.latestImplementationCommit = latestImplementationCommit;
          mutableLane.pushedCommit = pushedCommit;
          mutableLane.latestDecision = reviewerHandoff.decision;
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestReviewerHandoff = reviewerHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
          mutableLane.latestReviewerSummary = reviewerHandoff.summary;
          mutableLane.latestActivity =
            "Machine review approved the proposal, but refreshing the tracking GitHub PR for final approval failed.";
          mutableLane.runCount += 1;
          mutableLane.workerSlot = null;
          mutableLane.requeueReason = null;
          mutableLane.lastError = pullRequestErrorMessage;
          mutableLane.pullRequest = {
            ...trackingPullRequest,
            provider: trackingPullRequest.provider === "github" ? "github" : "local-ci",
            title: reviewPullRequestDraft.title,
            summary: reviewPullRequestDraft.summary,
            status: "failed",
            humanApprovalRequestedAt: null,
            humanApprovedAt: null,
            machineReviewedAt: mutableNow,
            updatedAt: mutableNow,
          };
          mutableLane.updatedAt = mutableNow;
          mutableLane.finishedAt = mutableNow;
          if (rebasedOntoBase) {
            appendLaneEvent(
              mutableLane,
              "planner",
              `Planner rebased the lane onto ${mutableLane.baseBranch ?? lane.baseBranch} before final approval.`,
              mutableNow,
            );
          }
          appendLaneEvent(
            mutableLane,
            "reviewer",
            `Reviewer completed machine review: ${reviewerHandoff.summary}`,
            mutableNow,
          );
          appendLaneEvent(
            mutableLane,
            "system",
            `Published commit ${formatCommitActivityReference({
              commitHash: pushedCommit.commitHash,
              commitUrl: pushedCommit.commitUrl,
            })} to GitHub via ${pushedCommit.remoteName}.`,
            mutableNow,
          );
          appendLaneEvent(mutableLane, "system", pullRequestErrorMessage, mutableNow);
          appendPlannerNote(
            mutableAssignment,
            rebasedOntoBase
              ? `Proposal ${mutableLane.laneIndex} was automatically rebased onto ${mutableLane.baseBranch ?? lane.baseBranch} and pushed to GitHub after machine review, but refreshing the tracking PR failed (${pullRequestErrorSummary}).`
              : `Proposal ${mutableLane.laneIndex} passed machine review and was pushed to GitHub, but refreshing the tracking PR failed (${pullRequestErrorSummary}).`,
            mutableNow,
          );
          synchronizeDispatchAssignment(mutableAssignment, mutableNow);
        },
      });

      await appendTeamCodexLogEvent({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        assignmentNumber,
        roleId: null,
        laneId,
        event: {
          source: "system",
          message: pullRequestErrorMessage,
          createdAt: new Date().toISOString(),
        },
      });

      return;
    }

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, mutableNow) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        mutableLane.status = "approved";
        mutableLane.executionPhase = null;
        mutableLane.latestImplementationCommit = latestImplementationCommit;
        mutableLane.pushedCommit = pushedCommit;
        mutableLane.latestDecision = reviewerHandoff.decision;
        mutableLane.latestCoderHandoff = coderHandoff;
        mutableLane.latestReviewerHandoff = reviewerHandoff;
        mutableLane.latestCoderSummary = coderHandoff.summary;
        mutableLane.latestReviewerSummary = reviewerHandoff.summary;
        mutableLane.latestActivity =
          "Reviewer completed machine review, pushed the branch to GitHub, and marked the tracking PR ready for final human approval.";
        mutableLane.runCount += 1;
        mutableLane.workerSlot = null;
        mutableLane.requeueReason = null;
        mutableLane.pullRequest = {
          ...trackingPullRequest,
          provider: "github",
          title: reviewPullRequestDraft.title,
          summary: reviewPullRequestDraft.summary,
          updatedAt: mutableNow,
          status: "awaiting_human_approval",
          humanApprovalRequestedAt: mutableNow,
          humanApprovedAt: null,
          machineReviewedAt: mutableNow,
          url: gitHubPullRequest?.url ?? trackingPullRequest.url,
        };
        mutableLane.updatedAt = mutableNow;
        mutableLane.finishedAt = mutableNow;
        if (rebasedOntoBase) {
          appendLaneEvent(
            mutableLane,
            "planner",
            `Planner rebased the lane onto ${mutableLane.baseBranch ?? lane.baseBranch} before final approval.`,
            mutableNow,
          );
        }
        appendLaneEvent(
          mutableLane,
          "reviewer",
          `Reviewer completed machine review: ${reviewerHandoff.summary}`,
          mutableNow,
        );
        appendLaneEvent(
          mutableLane,
          "system",
          `Published commit ${formatCommitActivityReference({
            commitHash: pushedCommit.commitHash,
            commitUrl: pushedCommit.commitUrl,
          })} to GitHub via ${pushedCommit.remoteName}.`,
          mutableNow,
        );
        appendLaneEvent(
          mutableLane,
          "system",
          `GitHub PR ready: ${gitHubPullRequest?.url ?? trackingPullRequest.url ?? "Not available"}`,
          mutableNow,
        );
        appendLaneEvent(
          mutableLane,
          "system",
          "Machine review completed. Human approval can now archive the OpenSpec change while the GitHub PR stays ready for review.",
          mutableNow,
        );
        appendPlannerNote(
          mutableAssignment,
          rebasedOntoBase
            ? `Proposal ${mutableLane.laneIndex} was automatically rebased onto ${mutableLane.baseBranch ?? lane.baseBranch}, pushed to GitHub, and marked ready on GitHub after machine review. It is now waiting for final human approval.`
            : `Proposal ${mutableLane.laneIndex} was pushed to GitHub, marked ready on GitHub after machine review, and is now waiting for final human approval.`,
          mutableNow,
        );
        synchronizeDispatchAssignment(mutableAssignment, mutableNow);
      },
    });

    return;
  }
};

const ensureLaneRun = ({
  threadId,
  assignmentNumber,
  laneId,
  dependencies,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  dependencies: TeamRoleDependencies;
}): void => {
  const key = laneRunKey(threadId, assignmentNumber, laneId);
  if (activeLaneRuns.has(key)) {
    return;
  }

  const runPromise = (async () => {
    try {
      await runLaneCycle({
        threadId,
        assignmentNumber,
        laneId,
        dependencies,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Background lane execution failed.";
      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (thread, now) => {
          const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
          const lane = findLane(assignment, laneId);
          const isFinalArchiveLane = isFinalArchivePhase(lane);
          lane.status = isFinalArchiveLane ? "approved" : "failed";
          lane.executionPhase = null;
          lane.workerSlot = null;
          lane.lastError = message;
          lane.latestActivity = isFinalArchiveLane
            ? "Final human approval failed before the coder archive pass and GitHub PR refresh could complete."
            : "Background lane execution failed.";
          if (lane.pullRequest) {
            lane.pullRequest = {
              ...lane.pullRequest,
              status: "failed",
              updatedAt: now,
            };
          }
          lane.updatedAt = now;
          lane.finishedAt = now;
          appendLaneEvent(lane, "system", message, now);
          appendPlannerNote(
            assignment,
            isFinalArchiveLane
              ? `Final approval for proposal ${lane.laneIndex} failed: ${message}`
              : `Lane ${lane.laneIndex} failed and needs attention: ${message}`,
            now,
          );
          synchronizeDispatchAssignment(assignment, now);
        },
      });
      await appendTeamCodexLogEvent({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        assignmentNumber,
        roleId: null,
        laneId,
        event: {
          source: "system",
          message,
          createdAt: new Date().toISOString(),
        },
      });
    } finally {
      activeLaneRuns.delete(key);
      void ensurePendingDispatchWork({ threadId, dependencies });
    }
  })();

  activeLaneRuns.set(key, runPromise);
};

const prioritizeThreadIds = (threadIds: string[], prioritizedThreadId?: string): string[] => {
  if (!prioritizedThreadId) {
    return threadIds;
  }

  return [...threadIds].sort((left, right) => {
    const leftPriority = left === prioritizedThreadId ? 0 : 1;
    const rightPriority = right === prioritizedThreadId ? 0 : 1;
    return leftPriority - rightPriority || left.localeCompare(right);
  });
};

export const ensurePendingDispatchWork = async ({
  threadId,
  dependencies,
}: {
  threadId?: string;
  dependencies?: Partial<TeamRoleDependencies>;
} = {}): Promise<void> => {
  const resolvedDependencies = resolveTeamRoleDependencies(dependencies);
  const pendingAssignments = await listPendingDispatchAssignments(teamConfig.storage.threadFile);
  const expectedAssignmentStateByKey = new Map<string, AssignmentThreadSchedulingState>();
  const expectedLaneStateByKey = new Map<string, LanePoolSchedulingState>();
  for (const pending of pendingAssignments) {
    expectedAssignmentStateByKey.set(
      buildAssignmentThreadPoolStateKey({
        threadId: pending.threadId,
        assignmentNumber: pending.assignment.assignmentNumber,
      }),
      captureAssignmentThreadSchedulingState(pending.assignment),
    );
    for (const lane of pending.assignment.lanes) {
      expectedLaneStateByKey.set(
        buildLanePoolStateKey({
          threadId: pending.threadId,
          assignmentNumber: pending.assignment.assignmentNumber,
          laneId: lane.laneId,
        }),
        captureLanePoolSchedulingState(lane),
      );
    }
  }

  assignPendingDispatchThreadSlots({
    pendingAssignments,
    workerCount: teamConfig.dispatch.workerCount,
    resolveAssignmentWorktreeRoot: (pending) =>
      resolveWorktreeRoot({
        repositoryPath: pending.assignment.repository?.path ?? "",
        worktreeRoot: teamConfig.dispatch.worktreeRoot,
      }),
  });

  assignPendingDispatchWorkerSlots({
    pendingAssignments,
    resolveAssignmentWorktreeRoot: (pending) =>
      resolveWorktreeRoot({
        repositoryPath: pending.assignment.repository?.path ?? "",
        worktreeRoot: teamConfig.dispatch.worktreeRoot,
      }),
  });

  const plannedAssignmentStateByKey = new Map<string, PlannedAssignmentThreadState>();
  const plannedLaneStateByKey = new Map<string, PlannedLanePoolState>();
  const pendingAssignmentsByThread = new Map<string, PendingDispatchAssignment[]>();
  for (const pending of pendingAssignments) {
    const assignmentThreadPoolStateKey = buildAssignmentThreadPoolStateKey({
      threadId: pending.threadId,
      assignmentNumber: pending.assignment.assignmentNumber,
    });
    const expectedAssignmentState = expectedAssignmentStateByKey.get(assignmentThreadPoolStateKey);
    if (expectedAssignmentState) {
      plannedAssignmentStateByKey.set(assignmentThreadPoolStateKey, {
        expected: expectedAssignmentState,
        planned: {
          threadSlot: pending.assignment.threadSlot ?? null,
          plannerWorktreePath: pending.assignment.plannerWorktreePath ?? null,
        },
      });
    }

    for (const lane of pending.assignment.lanes) {
      const lanePoolStateKey = buildLanePoolStateKey({
        threadId: pending.threadId,
        assignmentNumber: pending.assignment.assignmentNumber,
        laneId: lane.laneId,
      });
      const expectedLaneState = expectedLaneStateByKey.get(lanePoolStateKey);
      if (!expectedLaneState) {
        continue;
      }

      plannedLaneStateByKey.set(lanePoolStateKey, {
        expected: expectedLaneState,
        planned: {
          workerSlot: lane.workerSlot,
          worktreePath: lane.worktreePath,
        },
      });
    }

    const pendingForThread = pendingAssignmentsByThread.get(pending.threadId) ?? [];
    pendingForThread.push(pending);
    pendingAssignmentsByThread.set(pending.threadId, pendingForThread);
  }

  for (const currentThreadId of prioritizeThreadIds(
    [...pendingAssignmentsByThread.keys()],
    threadId,
  )) {
    const pendingForThread = pendingAssignmentsByThread.get(currentThreadId);
    if (!pendingForThread) {
      continue;
    }

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId: currentThreadId,
      updater: (thread, now) => {
        for (const pending of pendingForThread) {
          const assignment = findAssignment(
            thread.dispatchAssignments,
            pending.assignment.assignmentNumber,
          );
          const plannedAssignmentState = plannedAssignmentStateByKey.get(
            buildAssignmentThreadPoolStateKey({
              threadId: currentThreadId,
              assignmentNumber: assignment.assignmentNumber,
            }),
          );
          if (
            plannedAssignmentState &&
            assignmentThreadSchedulingStateMatches(assignment, plannedAssignmentState.expected)
          ) {
            assignment.threadSlot = plannedAssignmentState.planned.threadSlot;
            assignment.plannerWorktreePath = plannedAssignmentState.planned.plannerWorktreePath;
          }

          for (const lane of assignment.lanes) {
            const plannedLaneState = plannedLaneStateByKey.get(
              buildLanePoolStateKey({
                threadId: currentThreadId,
                assignmentNumber: assignment.assignmentNumber,
                laneId: lane.laneId,
              }),
            );
            if (!plannedLaneState) {
              continue;
            }

            if (!lanePoolSchedulingStateMatches(lane, plannedLaneState.expected)) {
              continue;
            }

            lane.workerSlot = plannedLaneState.planned.workerSlot;
            lane.worktreePath = plannedLaneState.planned.worktreePath;
          }

          synchronizeDispatchAssignment(assignment, now);
        }
      },
    });
  }

  const refreshedAssignments = await listPendingDispatchAssignments(teamConfig.storage.threadFile);

  for (const pending of refreshedAssignments) {
    for (const lane of pending.assignment.lanes) {
      if (
        (lane.status === "queued" || lane.status === "coding" || lane.status === "reviewing") &&
        lane.workerSlot
      ) {
        ensureLaneRun({
          threadId: pending.threadId,
          assignmentNumber: pending.assignment.assignmentNumber,
          laneId: lane.laneId,
          dependencies: resolvedDependencies,
        });
      }
    }
  }
};

export const queueLaneProposalForExecution = async ({
  threadId,
  assignmentNumber,
  laneId,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
}): Promise<void> => {
  await updateTeamThreadRecord({
    threadFile: teamConfig.storage.threadFile,
    threadId,
    updater: (thread, now) => {
      const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
      const lane = findLane(assignment, laneId);
      if (lane.status !== "awaiting_human_approval") {
        throw new Error("This proposal is not waiting for human approval.");
      }

      lane.status = "queued";
      lane.executionPhase = "implementation";
      lane.latestActivity = "Human approved the proposal and added it to the coding-review queue.";
      lane.approvalGrantedAt = now;
      lane.workerSlot = null;
      lane.worktreePath = null;
      lane.queuedAt = now;
      lane.updatedAt = now;
      lane.finishedAt = null;
      appendLaneEvent(
        lane,
        "human",
        "Human approved the proposal and sent it to the coding-review queue.",
        now,
      );
      appendPlannerNote(
        assignment,
        `Human approved proposal ${lane.laneIndex}; coding and machine review were queued.`,
        now,
      );
      synchronizeDispatchAssignment(assignment, now);
    },
  });
};

export const approveLaneProposal = async ({
  threadId,
  assignmentNumber,
  laneId,
  dependencies,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  dependencies?: Partial<TeamRoleDependencies>;
}): Promise<void> => {
  const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
  if (!thread) {
    throw new Error(`Thread ${threadId} was not found in ${teamConfig.storage.threadFile}.`);
  }

  const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
  const lane = findLane(assignment, laneId);

  if (lane.status !== "awaiting_human_approval") {
    throw new Error("This proposal is not waiting for human approval.");
  }

  if (!assignment.repository) {
    throw new Error("Approving a proposal requires a repository.");
  }

  if (!lane.branchName || !lane.baseBranch) {
    throw new Error("This proposal is missing the branch metadata required for approval.");
  }

  const pullRequestDraft = buildProposalApprovalPullRequestDraft({
    assignment,
    lane,
  });
  const proposalCommit = await getBranchHead({
    repositoryPath: assignment.repository.path,
    branchName: lane.branchName,
  });

  let pushedCommit: Awaited<ReturnType<typeof pushLaneBranch>> | null = null;

  try {
    pushedCommit = await pushLaneBranch({
      repositoryPath: assignment.repository.path,
      branchName: lane.branchName,
      commitHash: proposalCommit,
    });

    const gitHubPullRequest = await createOrUpdateGitHubPullRequest({
      repositoryPath: assignment.repository.path,
      branchName: lane.branchName,
      baseBranch: lane.baseBranch,
      title: pullRequestDraft.title,
      body: pullRequestDraft.summary,
      draft: true,
    });

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        if (mutableLane.status !== "awaiting_human_approval") {
          throw new Error("This proposal is not waiting for human approval.");
        }

        const isRetry = mutableLane.pullRequest?.status === "failed";
        const trackingPullRequest =
          mutableLane.pullRequest ??
          createPullRequestRecord({
            threadId,
            assignmentNumber,
            lane: mutableLane,
            draft: pullRequestDraft,
            now,
            provider: "github",
            status: "draft",
            humanApprovalRequestedAt: null,
            machineReviewedAt: null,
            url: gitHubPullRequest.url,
          });

        mutableLane.status = "queued";
        mutableLane.executionPhase = "implementation";
        mutableLane.latestActivity =
          "Human approved the proposal, refreshed the tracking GitHub draft PR, and queued coding plus machine review.";
        mutableLane.approvalGrantedAt = now;
        mutableLane.workerSlot = null;
        mutableLane.worktreePath = null;
        mutableLane.queuedAt = now;
        mutableLane.pushedCommit = pushedCommit;
        mutableLane.lastError = null;
        mutableLane.pullRequest = {
          ...trackingPullRequest,
          provider: "github",
          title: pullRequestDraft.title,
          summary: pullRequestDraft.summary,
          status: "draft",
          humanApprovalRequestedAt: null,
          humanApprovedAt: null,
          machineReviewedAt: null,
          updatedAt: now,
          url: gitHubPullRequest.url,
        };
        mutableLane.updatedAt = now;
        mutableLane.finishedAt = null;
        appendLaneEvent(
          mutableLane,
          "human",
          isRetry
            ? "Human retried proposal approval after GitHub draft PR setup failed."
            : "Human approved the proposal and sent it to GitHub draft PR setup plus the coding-review queue.",
          now,
        );
        appendLaneEvent(
          mutableLane,
          "system",
          `Published commit ${formatCommitActivityReference({
            commitHash: pushedCommit?.commitHash ?? proposalCommit,
            commitUrl: pushedCommit?.commitUrl ?? null,
          })} to GitHub via ${pushedCommit?.remoteName ?? "origin"}.`,
          now,
        );
        appendLaneEvent(
          mutableLane,
          "system",
          `GitHub draft PR ready: ${gitHubPullRequest.url}`,
          now,
        );
        appendPlannerNote(
          mutableAssignment,
          `Human approved proposal ${mutableLane.laneIndex}; ${mutableLane.branchName ?? lane.branchName} was pushed and is now tracked by draft GitHub PR ${gitHubPullRequest.url} while coding plus machine review run.`,
          now,
        );
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });
  } catch (error) {
    const errorSummary = summarizeGitFailure(
      error instanceof Error ? error.message : "GitHub draft PR setup failed.",
    );

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        if (mutableLane.status !== "awaiting_human_approval") {
          throw new Error("This proposal is not waiting for human approval.");
        }

        const trackingPullRequest =
          mutableLane.pullRequest ??
          createPullRequestRecord({
            threadId,
            assignmentNumber,
            lane: mutableLane,
            draft: pullRequestDraft,
            now,
            status: "failed",
            humanApprovalRequestedAt: null,
            machineReviewedAt: null,
          });

        mutableLane.executionPhase = null;
        mutableLane.latestActivity = pushedCommit
          ? "Human approval pushed the proposal branch, but GitHub draft PR setup failed before coding could be queued."
          : "Human approval failed before the proposal branch could be pushed and tracked with a GitHub draft PR.";
        mutableLane.approvalGrantedAt = null;
        mutableLane.workerSlot = null;
        mutableLane.worktreePath = null;
        mutableLane.queuedAt = null;
        mutableLane.pushedCommit = pushedCommit;
        mutableLane.lastError = errorSummary;
        mutableLane.pullRequest = {
          ...trackingPullRequest,
          title: pullRequestDraft.title,
          summary: pullRequestDraft.summary,
          status: "failed",
          humanApprovalRequestedAt: null,
          humanApprovedAt: null,
          machineReviewedAt: null,
          updatedAt: now,
        };
        mutableLane.updatedAt = now;
        mutableLane.finishedAt = now;
        if (pushedCommit) {
          appendLaneEvent(
            mutableLane,
            "system",
            `Published commit ${formatCommitActivityReference({
              commitHash: pushedCommit.commitHash,
              commitUrl: pushedCommit.commitUrl,
            })} to GitHub via ${pushedCommit.remoteName}.`,
            now,
          );
        }
        appendLaneEvent(mutableLane, "system", errorSummary, now);
        appendPlannerNote(
          mutableAssignment,
          `Human approval for proposal ${mutableLane.laneIndex} could not finish draft PR setup: ${errorSummary}`,
          now,
        );
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });

    throw error;
  }

  void ensurePendingDispatchWork({ threadId, dependencies });
};

export const approveLanePullRequest = async ({
  threadId,
  assignmentNumber,
  laneId,
  dependencies,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  dependencies?: Partial<TeamRoleDependencies>;
}): Promise<void> => {
  const resolvedDependencies = resolveTeamRoleDependencies(dependencies);
  const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
  if (!thread) {
    throw new Error(`Thread ${threadId} was not found in ${teamConfig.storage.threadFile}.`);
  }

  const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
  const lane = findLane(assignment, laneId);
  const pullRequest = lane.pullRequest;
  const archiveInProgress =
    isFinalArchivePhase(lane) && (lane.status === "queued" || lane.status === "coding");

  if ((!archiveInProgress && lane.status !== "approved") || !pullRequest) {
    throw new Error("This reviewed branch is not waiting for final human approval.");
  }

  if (pullRequest.status === "approved") {
    return;
  }

  if (pullRequest.status !== "awaiting_human_approval" && pullRequest.status !== "failed") {
    throw new Error(
      "This reviewed branch cannot be finalized from its current pull request state.",
    );
  }

  if (!assignment.repository) {
    throw new Error("Finalizing a reviewed branch requires a repository.");
  }

  if (!lane.branchName || !lane.baseBranch || !lane.proposalChangeName) {
    throw new Error(
      "This reviewed branch is missing the branch or OpenSpec metadata required for final approval.",
    );
  }

  const pullRequestSummary =
    pullRequest.summary?.trim() ||
    lane.latestReviewerSummary?.trim() ||
    `Proposal ${lane.laneIndex} passed machine review.`;
  const pullRequestTitle = buildCanonicalLanePullRequestDraft({
    assignment,
    lane,
    summary: pullRequestSummary,
  }).title;
  await updateTeamThreadRecord({
    threadFile: teamConfig.storage.threadFile,
    threadId,
    updater: (mutableThread, now) => {
      const mutableAssignment = findAssignment(mutableThread.dispatchAssignments, assignmentNumber);
      const mutableLane = findLane(mutableAssignment, laneId);
      const mutablePullRequest = mutableLane.pullRequest;
      const mutableArchiveInProgress =
        isFinalArchivePhase(mutableLane) &&
        (mutableLane.status === "queued" || mutableLane.status === "coding");

      if ((!mutableArchiveInProgress && mutableLane.status !== "approved") || !mutablePullRequest) {
        throw new Error("This reviewed branch is not waiting for final human approval.");
      }

      if (mutablePullRequest.status === "approved") {
        return;
      }

      if (
        mutablePullRequest.status !== "awaiting_human_approval" &&
        mutablePullRequest.status !== "failed"
      ) {
        throw new Error(
          "This reviewed branch cannot be finalized from its current pull request state.",
        );
      }

      const nextHumanApprovedAt = mutablePullRequest.humanApprovedAt ?? now;
      const isRetry = mutablePullRequest.status === "failed";
      const isResume =
        mutablePullRequest.status === "awaiting_human_approval" &&
        mutablePullRequest.humanApprovedAt !== null;

      if (mutableArchiveInProgress) {
        mutableLane.lastError = null;
        mutableLane.pullRequest = {
          ...mutablePullRequest,
          title: pullRequestTitle,
          summary: pullRequestSummary,
          status: "awaiting_human_approval",
          humanApprovedAt: nextHumanApprovedAt,
          updatedAt: now,
        };
        mutableLane.updatedAt = now;
        synchronizeDispatchAssignment(mutableAssignment, now);
        return;
      }

      mutableLane.status = "queued";
      mutableLane.executionPhase = "final_archive";
      mutableLane.latestActivity = buildFinalArchiveApprovalActivity({
        lane: mutableLane,
        isRetry,
        isResume,
      });
      mutableLane.lastError = null;
      mutableLane.workerSlot = null;
      mutableLane.queuedAt = now;
      mutableLane.finishedAt = null;
      mutableLane.pullRequest = {
        ...mutablePullRequest,
        title: pullRequestTitle,
        summary: pullRequestSummary,
        status: "awaiting_human_approval",
        humanApprovedAt: nextHumanApprovedAt,
        updatedAt: now,
      };
      mutableLane.updatedAt = now;
      if (!isResume && !mutableArchiveInProgress) {
        appendLaneEvent(
          mutableLane,
          "human",
          isRetry
            ? "Human retried final approval for the machine-reviewed branch."
            : "Human approved the machine-reviewed branch for OpenSpec archive and GitHub PR refresh.",
          now,
        );
      }
      synchronizeDispatchAssignment(mutableAssignment, now);
    },
  });

  await ensurePendingDispatchWork({
    threadId,
    dependencies: resolvedDependencies,
  });

  await activeLaneRuns.get(laneRunKey(threadId, assignmentNumber, laneId));

  const refreshedThread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
  if (!refreshedThread) {
    throw new Error(`Thread ${threadId} was not found in ${teamConfig.storage.threadFile}.`);
  }

  const refreshedLane = findLane(
    findAssignment(refreshedThread.dispatchAssignments, assignmentNumber),
    laneId,
  );

  if (refreshedLane.pullRequest?.status === "failed") {
    throw new Error(refreshedLane.lastError ?? "Final approval failed.");
  }
};

const buildProposalSnapshot = (assignment: TeamDispatchAssignment): string => {
  return assignment.lanes
    .filter((lane) => lane.taskTitle || lane.taskObjective)
    .map((lane) => {
      return [
        `Proposal ${lane.laneIndex}: ${lane.taskTitle ?? "Untitled proposal"}`,
        `Objective: ${lane.taskObjective ?? "No objective recorded."}`,
        `Status: ${lane.status}`,
        lane.latestCoderSummary ? `Latest coding summary: ${lane.latestCoderSummary}` : null,
        lane.latestReviewerSummary ? `Latest machine review: ${lane.latestReviewerSummary}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
};

const buildFeedbackReplanInput = ({
  originalRequest,
  assignment,
  scope,
  lane,
  suggestion,
}: {
  originalRequest: string;
  assignment: TeamDispatchAssignment;
  scope: TeamHumanFeedbackScope;
  lane: TeamWorkerLaneRecord | null;
  suggestion: string;
}): string => {
  return [
    `Original request:\n${originalRequest}`,
    assignment.requestTitle ? `Current request title:\n${assignment.requestTitle}` : null,
    assignment.plannerSummary ? `Latest planner summary:\n${assignment.plannerSummary}` : null,
    assignment.canonicalBranchName
      ? `Canonical branch namespace:\n${assignment.canonicalBranchName}`
      : null,
    `Current proposal set:\n${buildProposalSnapshot(assignment) || "No proposals recorded yet."}`,
    scope === "proposal" && lane
      ? [
          `Human feedback for proposal ${lane.laneIndex} (${lane.taskTitle ?? "Untitled proposal"}):`,
          suggestion,
          "Regenerate the proposal set with this proposal adjusted first while keeping the request group coherent.",
        ].join("\n")
      : [
          "Human feedback for the full request group:",
          suggestion,
          "Regenerate the proposal set so the next planning pass reflects this updated direction.",
        ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
};

export const prepareAssignmentReplan = async ({
  threadId,
  assignmentNumber,
  scope,
  laneId,
  suggestion,
}: {
  threadId: string;
  assignmentNumber: number;
  scope: TeamHumanFeedbackScope;
  laneId?: string;
  suggestion: string;
}): Promise<{
  input: string;
  title: string | undefined;
  requestText: string;
  repositoryId: string | undefined;
}> => {
  const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
  if (!thread) {
    throw new TeamThreadReplanError("not_found", `Thread ${threadId} was not found.`, 404);
  }

  if (thread.archivedAt) {
    throw new TeamThreadReplanError("archived", "Archived threads cannot restart planning.", 409);
  }

  const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
  if (assignment.supersededAt) {
    throw new TeamThreadReplanError(
      "superseded",
      "This request group has already been superseded by newer feedback.",
      409,
    );
  }

  const hasActiveQueue = assignment.lanes.some(
    (lane) => lane.status === "queued" || lane.status === "coding" || lane.status === "reviewing",
  );
  if (hasActiveQueue) {
    throw new TeamThreadReplanError(
      "active_queue",
      "Wait for the active coding-review queue to finish before restarting planning with human feedback.",
      409,
    );
  }

  const targetLane = scope === "proposal" ? findLane(assignment, laneId ?? "") : null;
  const originalRequest =
    assignment.requestText ?? thread.data.requestText ?? thread.data.latestInput;
  if (!originalRequest) {
    throw new Error("The original request could not be recovered for replanning.");
  }

  await updateTeamThreadRecord({
    threadFile: teamConfig.storage.threadFile,
    threadId,
    updater: (mutableThread, now) => {
      const mutableAssignment = findAssignment(mutableThread.dispatchAssignments, assignmentNumber);
      mutableAssignment.humanFeedback = [
        ...mutableAssignment.humanFeedback,
        createHumanFeedback({
          scope,
          laneId: targetLane?.laneId ?? null,
          message: suggestion,
          createdAt: now,
        }),
      ];
      mutableAssignment.supersededAt = now;
      mutableAssignment.supersededReason =
        scope === "proposal"
          ? `Human requested proposal-specific changes for ${targetLane?.taskTitle ?? targetLane?.laneId ?? "the selected proposal"}.`
          : "Human requested request-group changes.";

      if (targetLane) {
        const mutableLane = findLane(mutableAssignment, targetLane.laneId);
        mutableLane.latestActivity =
          "Human requested proposal-specific changes and sent this request group back to planning.";
        mutableLane.updatedAt = now;
        appendLaneEvent(
          mutableLane,
          "human",
          `Human feedback requested replanning: ${suggestion}`,
          now,
        );
      }

      appendPlannerNote(
        mutableAssignment,
        scope === "proposal"
          ? `Human requested new planning guidance for proposal ${targetLane?.laneIndex}.`
          : "Human requested new planning guidance for the full request group.",
        now,
      );
      synchronizeDispatchAssignment(mutableAssignment, now);
    },
  });

  return {
    input: buildFeedbackReplanInput({
      originalRequest,
      assignment,
      scope,
      lane: targetLane,
      suggestion,
    }),
    title: assignment.requestTitle ?? thread.data.requestTitle ?? undefined,
    requestText: originalRequest,
    repositoryId: thread.data.selectedRepository?.id,
  };
};

export const teamNetworkDispatchOps = {
  approveLaneProposal,
  approveLanePullRequest,
  createPlannerDispatchAssignment,
  ensurePendingDispatchWork,
  queueLaneProposalForExecution,
};

const normalizeRequestText = (value: string | null | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const describeUnknownError = (error: unknown): string => {
  return error instanceof Error ? error.message : "Unknown error.";
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

const findPersistedLane = (
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

const isLaneQueuedForExecution = (
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

const isLanePullRequestFinalized = (
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

  try {
    const generatedMetadata = await generateRequestMetadata({
      input,
      requestText,
      tasks: null,
      worktreePath,
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
    requestText,
  };
};

const generateRequestMetadata = async ({
  input,
  requestText,
  tasks,
  worktreePath,
  dependencies,
}: {
  input: string;
  requestText: string;
  tasks?: Array<{
    title: string;
    objective: string;
  }> | null;
  worktreePath: string;
  dependencies: TeamRoleDependencies;
}): Promise<{
  requestTitle: string | null;
  conventionalTitle: ConventionalTitleMetadata | null;
}> => {
  const generatedTitleResponse = await dependencies.requestTitleAgent.run({
    input,
    requestText,
    worktreePath,
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
        input,
        requestText: initialMetadata.requestText,
        tasks,
        worktreePath,
        dependencies,
      });
    } catch (error) {
      generationError = error;
    }
  }

  const requestTitle =
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
    worktreePath: selectedRepository?.path ?? process.cwd(),
    dependencies: env.deps,
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

  const plannerResponse = await env.deps.plannerAgent.run({
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
  const persistedThread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
  const persistedAssignment = findPersistedAssignment(persistedThread, state.assignmentNumber);
  const persistedPlannerStep = getPersistedPlannerStep({
    thread: persistedThread,
    assignmentNumber: state.assignmentNumber,
  });
  const finalizedRequestMetadata =
    persistedAssignment || persistedPlannerStep
      ? resolvePersistedRequestMetadata({
          thread: persistedThread,
          assignment: persistedAssignment,
          fallbackRequestText: requestMetadata.requestText,
        })
      : await finalizeRequestMetadata({
          initialMetadata: requestMetadata,
          input: args.input,
          tasks: plannerResponse.dispatch?.tasks ?? null,
          worktreePath: selectedRepository?.path ?? process.cwd(),
          dependencies: env.deps,
          logEvent: forwardPlannerEvent,
        });
  state.requestText = finalizedRequestMetadata.requestText;

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

    if (!persistedAssignment) {
      await teamNetworkDispatchOps.createPlannerDispatchAssignment({
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
      threadFile: teamConfig.storage.threadFile,
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

const runCodingStage = async (
  env: TeamRunEnv,
  currentState: TeamRunCodingStageState,
): Promise<TeamRunReviewingStageState> => {
  const persistedThread = await getTeamThreadRecord(
    teamConfig.storage.threadFile,
    currentState.args.threadId,
  );
  const persistedLane = findPersistedLane(
    persistedThread,
    currentState.args.assignmentNumber,
    currentState.args.laneId,
  );

  if (!persistedLane || persistedLane.status === "awaiting_human_approval") {
    await teamNetworkDispatchOps.approveLaneProposal({
      threadId: currentState.args.threadId,
      assignmentNumber: currentState.args.assignmentNumber,
      laneId: currentState.args.laneId,
      dependencies: env.deps,
    });
  } else if (!isLaneQueuedForExecution(persistedLane)) {
    throw new Error("This proposal is not waiting for human approval.");
  }

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
  await teamNetworkDispatchOps.ensurePendingDispatchWork({
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
  env: TeamRunEnv,
  currentState: TeamRunArchivingStageState,
): Promise<TeamRunCompletedState> => {
  const persistedThread = await getTeamThreadRecord(
    teamConfig.storage.threadFile,
    currentState.args.threadId,
  );
  const persistedLane = findPersistedLane(
    persistedThread,
    currentState.args.assignmentNumber,
    currentState.args.laneId,
  );

  if (!persistedLane || !isLanePullRequestFinalized(persistedLane)) {
    await teamNetworkDispatchOps.approveLanePullRequest({
      threadId: currentState.args.threadId,
      assignmentNumber: currentState.args.assignmentNumber,
      laneId: currentState.args.laneId,
      dependencies: env.deps,
    });
  }

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
      return runCodingStage(env, currentState);
    case "reviewing":
      return runReviewingStage(env, currentState);
    case "archiving":
      return runArchivingStage(env, currentState);
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
