import type { TeamThreadSummary } from "@/lib/team/history";
import type {
  TeamHumanFeedbackScope,
  TeamPullRequestStatus,
  TeamThreadStatus,
  TeamWorkerLaneRecord,
} from "@/lib/team/types";

export const threadStatusLabels: Record<TeamThreadStatus, string> = {
  planning: "Planning",
  running: "Coding / Reviewing",
  awaiting_human_approval: "Awaiting Proposal Approval",
  completed: "Completed",
  approved: "Machine Reviewed",
  needs_revision: "Needs Revision",
  failed: "Failed",
};

export const pullRequestStatusLabels: Record<TeamPullRequestStatus, string> = {
  draft: "Draft PR",
  awaiting_human_approval: "Awaiting Approval",
  approved: "Machine Reviewed",
  conflict: "Conflict",
  failed: "Failed",
};

export const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return date.toLocaleString();
};

export const formatThreadId = (threadId: string): string => {
  return threadId.slice(0, 8);
};

export const formatCommitHash = (commitHash: string, length = 12): string => {
  return commitHash.slice(0, length);
};

export const getLaneBranchDisplay = (
  lane: TeamWorkerLaneRecord,
): {
  label: string;
  value: string;
  href: string | null;
} => {
  return {
    label: lane.pushedCommit ? "GitHub Branch" : "Branch",
    value: lane.branchName ?? "Not allocated",
    href: lane.pushedCommit?.branchUrl ?? null,
  };
};

export const getLaneCommitDisplay = (
  lane: TeamWorkerLaneRecord,
): {
  label: string;
  value: string;
  fullValue: string;
  href: string | null;
} | null => {
  const commitHash = lane.pushedCommit?.commitHash ?? lane.latestImplementationCommit;
  if (!commitHash) {
    return null;
  }

  return {
    label: lane.pushedCommit ? "GitHub Commit" : "Review Commit",
    value: formatCommitHash(commitHash),
    fullValue: commitHash,
    href: lane.pushedCommit?.commitUrl ?? null,
  };
};

export const buildFeedbackKey = (
  threadId: string,
  assignmentNumber: number,
  scope: TeamHumanFeedbackScope,
  laneId?: string,
): string => {
  return `${threadId}:${assignmentNumber}:${scope}:${laneId ?? "request-group"}`;
};

export const canRestartPlanning = (thread: TeamThreadSummary): boolean => {
  return (
    thread.workerCounts.queued === 0 &&
    thread.workerCounts.coding === 0 &&
    thread.workerCounts.reviewing === 0
  );
};

export const describeThreadProgress = (thread: TeamThreadSummary): string => {
  if (thread.lastError) {
    return thread.lastError;
  }

  if (thread.latestPlanSummary) {
    return thread.latestPlanSummary;
  }

  if (thread.latestInput && thread.latestInput !== thread.requestText) {
    return thread.status === "planning"
      ? "Planner is refreshing the proposal set with the latest feedback."
      : "This thread includes additional planning context beyond the raw request text.";
  }

  return "No planner summary recorded yet.";
};

export const describeLane = (lane: TeamWorkerLaneRecord): string => {
  if (lane.status === "idle") {
    return "Idle and waiting for planner work.";
  }

  if (lane.status === "awaiting_human_approval") {
    return "Planner proposed this work and is waiting for human approval before coding and review begin.";
  }

  if (lane.pullRequest?.status === "conflict") {
    return "Planner detected a pull request conflict and requeued this proposal.";
  }

  if (lane.requeueReason === "reviewer_requested_changes") {
    return "Reviewer requested changes; the approved proposal is queued for another coding pass.";
  }

  if (lane.requeueReason === "planner_detected_conflict") {
    return "Planner detected a conflict; the proposal is queued for conflict resolution.";
  }

  if (lane.status === "approved") {
    return "Coding and machine review are complete. Human feedback can start a fresh planning pass from this proposal or the whole request group.";
  }

  return lane.latestActivity ?? "Proposal work is active.";
};

export const getLaneStatusLabel = (lane: TeamWorkerLaneRecord): string => {
  switch (lane.status) {
    case "idle":
      return "Idle";
    case "queued":
      return lane.pullRequest?.status === "conflict" ? "Queued for Conflict Fix" : "Queued";
    case "coding":
      return "Coding";
    case "reviewing":
      return "Reviewing";
    case "awaiting_human_approval":
      return "Awaiting Approval";
    case "approved":
      return "Machine Reviewed";
    case "failed":
      return "Failed";
  }
};

export const getLaneStatusClassName = (lane: TeamWorkerLaneRecord): string => {
  if (lane.status === "queued" && lane.pullRequest?.status === "conflict") {
    return "status-conflict";
  }

  switch (lane.status) {
    case "idle":
      return "status-idle";
    case "queued":
      return "status-queued";
    case "coding":
      return "status-coding";
    case "reviewing":
      return "status-reviewing";
    case "awaiting_human_approval":
      return "status-awaiting_human_approval";
    case "approved":
      return "status-approved";
    case "failed":
      return "status-failed";
  }
};

export const formatFeedbackLabel = (thread: TeamThreadSummary, laneId: string | null): string => {
  if (!laneId) {
    return "Request-group feedback";
  }

  const lane = thread.workerLanes.find((candidate) => candidate.laneId === laneId);
  return lane ? `Proposal ${lane.laneIndex} feedback` : "Proposal feedback";
};
