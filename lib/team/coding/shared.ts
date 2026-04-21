import "server-only";

import { teamConfig } from "@/team.config";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import { buildCanonicalBranchName } from "@/lib/team/git";
import type { TeamThreadRecord } from "@/lib/team/history";
import type { TeamExecutionMode } from "@/lib/team/execution-mode";
import {
  buildLanePullRequestTitle,
  type ConventionalTitleMetadata,
} from "@/lib/team/request-title";
import {
  getLaneFinalizationCheckpoint,
  getLaneFinalizationMode,
  getLaneProposalDisposition,
  hasReachedLaneFinalizationCheckpoint,
  isLaneProposalArchived,
} from "@/lib/team/finalization";
import type { TeamRoleDependencies } from "@/lib/team/roles/dependencies";
import type { LanePullRequestDraft } from "@/lib/team/coding/lane-state";
import type { Worktree } from "@/lib/team/coding/worktree";
import type {
  TeamCodexLogEntry,
  TeamDispatchAssignment,
  TeamExecutionStep,
  TeamLaneFinalizationMode,
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
  executionMode?: TeamExecutionMode | null;
  requestText: string | null;
  threadWorktree: Worktree | null;
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
  executionMode?: TeamExecutionMode | null;
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
  finalizationMode: TeamLaneFinalizationMode;
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

export type ResolvedRequestMetadata = {
  requestTitle: string;
  conventionalTitle: ConventionalTitleMetadata | null;
  executionMode?: TeamExecutionMode | null;
  requestText: string;
};

export type InitialRequestMetadata = {
  requestTitle: string | null;
  conventionalTitle: ConventionalTitleMetadata | null;
  executionMode?: TeamExecutionMode | null;
  requestText: string;
};

export type PlannerAgentResult = Awaited<ReturnType<TeamRoleDependencies["plannerAgent"]["run"]>>;
export type PersistedTeamThread = TeamThreadRecord;

export type TeamRunPlanningContext = {
  threadId: string;
  worktree: Worktree;
  selectedRepository: TeamRepositoryOption | null;
  existingThread: TeamThreadRecord | null;
  shouldResetAssignment: boolean;
  state: TeamRunState;
  requestMetadata: InitialRequestMetadata;
};

export type TeamPlannerRetryResumeContext = Omit<TeamRunPlanningContext, "existingThread">;

export type TeamRunInitState = {
  stage: "init";
  args: TeamRunArgs;
};

export type TeamRunPlanningStageState = {
  stage: "planning";
  args: TeamPlanningRunArgs;
  context: TeamRunPlanningContext;
};

export type TeamRunMetadataGenerationStageState = {
  stage: "metadata-generation";
  args: TeamPlanningRunArgs;
  context: TeamRunPlanningContext;
  plannerResponse: PlannerAgentResult;
  plannerRoleName: string;
};

export type TeamPlannerRetryResumeState =
  | {
      stage: "planning";
      args: TeamPlanningRunArgs;
      context: TeamPlannerRetryResumeContext;
    }
  | {
      stage: "metadata-generation";
      args: TeamPlanningRunArgs;
      context: TeamPlannerRetryResumeContext;
      plannerResponse: PlannerAgentResult;
      plannerRoleName: string;
    };

export type TeamPlannerRetryState = {
  roleId: "planner";
  roleName: "Planner";
  attempts: number;
  maxAttempts: number;
  round: number;
  nextRetryAt: string | null;
  awaitingConfirmationSince: string | null;
  lastError: string | null;
  updatedAt: string;
  resumeState: TeamPlannerRetryResumeState;
};

export type TeamRunCodingStageState = {
  stage: "coding";
  args: TeamProposalApprovalRunArgs;
  worktree: Worktree;
};

export type TeamRunReviewingStageState = {
  stage: "reviewing";
  args: TeamRunArgs;
  threadId?: string;
  result: TeamRunResult;
};

export type TeamRunArchivingStageState = {
  stage: "archiving";
  args: TeamPullRequestApprovalRunArgs;
  worktree: Worktree;
};

export type TeamRunCompletedState = {
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

export class DispatchThreadCapacityError extends Error {
  workerCount: number;

  constructor(workerCount: number) {
    super(
      `All ${workerCount} shared meow worktree slot${workerCount === 1 ? " is" : "s are"} already claimed by living repository-backed threads. Archive an inactive thread before starting a new repository-backed request.`,
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

const createLaneEvent = (actor: TeamWorkerEventActor, message: string, createdAt: string) => {
  return {
    id: crypto.randomUUID(),
    actor,
    message,
    createdAt,
  };
};

export const resolveAssignmentCanonicalBranchName = ({
  threadId,
  assignment,
}: {
  threadId: string;
  assignment: Pick<
    TeamDispatchAssignment,
    "assignmentNumber" | "branchPrefix" | "canonicalBranchName"
  >;
}): string | null => {
  if (assignment.canonicalBranchName) {
    return assignment.canonicalBranchName;
  }

  if (!assignment.branchPrefix) {
    return null;
  }

  return buildCanonicalBranchName({
    threadId,
    branchPrefix: assignment.branchPrefix,
    assignmentNumber: assignment.assignmentNumber,
  });
};

const createPlannerNote = (message: string, createdAt: string): TeamPlannerNote => {
  return {
    id: crypto.randomUUID(),
    message,
    createdAt,
  };
};

export const findAssignment = (
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

export const findLane = (
  assignment: TeamDispatchAssignment,
  laneId: string,
): TeamWorkerLaneRecord => {
  const lane = assignment.lanes.find((candidate) => candidate.laneId === laneId);
  if (!lane) {
    throw new Error(`Lane ${laneId} was not found in assignment #${assignment.assignmentNumber}.`);
  }

  return lane;
};

export const appendPlannerNote = (
  assignment: TeamDispatchAssignment,
  message: string,
  now: string,
): void => {
  assignment.plannerNotes = [...assignment.plannerNotes, createPlannerNote(message, now)];
};

export const appendLaneEvent = (
  lane: TeamWorkerLaneRecord,
  actor: TeamWorkerEventActor,
  message: string,
  now: string,
): void => {
  lane.events = [...lane.events, createLaneEvent(actor, message, now)];
};

export const isFinalArchivePhase = (
  lane: Pick<TeamWorkerLaneRecord, "executionPhase">,
): lane is Pick<TeamWorkerLaneRecord, "executionPhase"> & { executionPhase: "final_archive" } => {
  return lane.executionPhase === "final_archive";
};

type FinalizationApprovalActivityLane = Pick<
  TeamWorkerLaneRecord,
  | "finalizationCheckpoint"
  | "finalizationMode"
  | "proposalDisposition"
  | "proposalPath"
  | "pullRequest"
  | "status"
>;

type FinalizationApprovalActivityArgs = {
  lane: FinalizationApprovalActivityLane;
  mode: TeamLaneFinalizationMode;
  isRetry: boolean;
  isResume: boolean;
  implementationLabel?: "coder" | "executor";
};

export const buildFinalizationApprovalActivity = ({
  lane,
  mode,
  isRetry,
  isResume,
  implementationLabel = "coder",
}: FinalizationApprovalActivityArgs): string => {
  const proposalDisposition = getLaneProposalDisposition(lane);
  const hasBranchPush = hasReachedLaneFinalizationCheckpoint(lane, "branch_pushed");
  const finalizationMode = mode ?? getLaneFinalizationMode(lane) ?? "archive";

  if (finalizationMode === "delete") {
    if (isRetry) {
      if (hasBranchPush) {
        return "Retrying delete finalization by refreshing the GitHub PR for the deleted OpenSpec change.";
      }

      if (proposalDisposition === "deleted") {
        return "Retrying delete finalization after deleting the OpenSpec change. The branch push and GitHub PR refresh will resume.";
      }

      return "Retrying final approval through OpenSpec change deletion and GitHub PR refresh.";
    }

    if (isResume) {
      if (hasBranchPush) {
        return "Resuming delete finalization by refreshing the GitHub PR for the deleted OpenSpec change.";
      }

      if (proposalDisposition === "deleted") {
        return "Resuming delete finalization after deleting the OpenSpec change. The branch push and GitHub PR refresh will continue.";
      }

      return "Resuming final approval through OpenSpec change deletion and GitHub PR refresh.";
    }

    if (
      proposalDisposition === "deleted" ||
      getLaneFinalizationCheckpoint(lane) === "artifacts_applied"
    ) {
      return "Human approved the deleted machine-reviewed branch. Pushing the branch update before refreshing the GitHub PR.";
    }

    return "Human approved the machine-reviewed branch. Queueing OpenSpec change deletion before refreshing the GitHub PR.";
  }

  const archivePassLabel =
    implementationLabel === "executor" ? "executor archive pass" : "coder archive pass";

  if (isRetry) {
    return isLaneProposalArchived(lane)
      ? "Retrying final approval for the archived OpenSpec change and GitHub PR refresh."
      : `Retrying final approval through the ${archivePassLabel} and GitHub PR refresh.`;
  }

  if (isResume) {
    return isLaneProposalArchived(lane)
      ? "Resuming final approval for the archived OpenSpec change and GitHub PR refresh."
      : `Resuming final approval through the ${archivePassLabel} and GitHub PR refresh.`;
  }

  return isLaneProposalArchived(lane)
    ? "Human approved the archived machine-reviewed branch. Refreshing the GitHub PR."
    : `Human approved the machine-reviewed branch. Queueing the ${archivePassLabel} before refreshing the GitHub PR.`;
};

export const buildFinalArchiveApprovalActivity = ({
  lane,
  isRetry,
  isResume,
  implementationLabel = "coder",
}: Omit<FinalizationApprovalActivityArgs, "mode">): string => {
  return buildFinalizationApprovalActivity({
    lane,
    mode: "archive",
    isRetry,
    isResume,
    implementationLabel,
  });
};

export const summarizeGitFailure = (message: string): string => {
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

export const buildCanonicalLanePullRequestDraft = ({
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

export const buildProposalApprovalPullRequestDraft = ({
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

export const createPullRequestRecord = ({
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
