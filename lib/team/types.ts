import type { TeamRepositoryOption } from "@/lib/team/repository-types";

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

export type TeamThreadStatus =
  | "planning"
  | "running"
  | "awaiting_human_approval"
  | "completed"
  | "approved"
  | "needs_revision"
  | "failed";

export type TeamWorkerLaneStatus =
  | "idle"
  | "queued"
  | "coding"
  | "reviewing"
  | "awaiting_human_approval"
  | "approved"
  | "failed";

export type TeamPullRequestStatus =
  | "draft"
  | "awaiting_human_approval"
  | "approved"
  | "conflict"
  | "failed";

export type TeamPlannerNote = {
  id: string;
  message: string;
  createdAt: string;
};

export type TeamWorkerEventActor = "planner" | "coder" | "reviewer" | "system" | "human";

export type TeamWorkerEvent = {
  id: string;
  actor: TeamWorkerEventActor;
  message: string;
  createdAt: string;
};

export type TeamPullRequestRecord = {
  id: string;
  provider: "local-ci";
  title: string;
  branchName: string;
  baseBranch: string;
  status: TeamPullRequestStatus;
  requestedAt: string;
  humanApprovalRequestedAt: string | null;
  humanApprovedAt: string | null;
  updatedAt: string;
  url: string | null;
};

export type TeamWorkerLaneRecord = {
  laneId: string;
  laneIndex: number;
  status: TeamWorkerLaneStatus;
  taskTitle: string | null;
  taskObjective: string | null;
  branchName: string | null;
  baseBranch: string | null;
  worktreePath: string | null;
  latestDecision: TeamRoleDecision | null;
  latestCoderSummary: string | null;
  latestReviewerSummary: string | null;
  latestActivity: string | null;
  runCount: number;
  revisionCount: number;
  requeueReason: "reviewer_requested_changes" | "planner_detected_conflict" | null;
  lastError: string | null;
  pullRequest: TeamPullRequestRecord | null;
  events: TeamWorkerEvent[];
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
};

export type TeamDispatchAssignmentStatus =
  | "planning"
  | "running"
  | "awaiting_human_approval"
  | "approved"
  | "completed"
  | "failed";

export type TeamDispatchAssignment = {
  assignmentNumber: number;
  status: TeamDispatchAssignmentStatus;
  repository: TeamRepositoryOption | null;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  plannerSummary: string | null;
  plannerDeliverable: string | null;
  branchPrefix: string | null;
  baseBranch: string | null;
  workerCount: number;
  lanes: TeamWorkerLaneRecord[];
  plannerNotes: TeamPlannerNote[];
};

export type TeamWorkerLaneCounts = {
  idle: number;
  queued: number;
  coding: number;
  reviewing: number;
  awaitingHumanApproval: number;
  approved: number;
  failed: number;
};
