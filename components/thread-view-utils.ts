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
  awaiting_human_approval: "Awaiting Final Approval",
  approved: "GitHub PR Ready",
  conflict: "Conflict",
  failed: "Finalization Failed",
};

export type LaneApprovalAction = {
  target: "proposal" | "pull_request";
  buttonLabel: string;
  pendingLabel: string;
  successNotice: string;
  errorFallback: string;
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

  if (lane.executionPhase === "final_archive" && lane.status === "queued") {
    return (
      lane.latestActivity ??
      "Final approval queued a dedicated archive continuation before GitHub PR refresh."
    );
  }

  if (lane.executionPhase === "final_archive" && lane.status === "coding") {
    return lane.latestActivity ?? "A dedicated final archive continuation is running.";
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
    if (lane.pullRequest?.status === "awaiting_human_approval") {
      return lane.pullRequest.humanApprovedAt
        ? "Final human approval was recorded. The dedicated archive continuation is preparing the archived OpenSpec change and GitHub PR."
        : "Coding and machine review are complete. Human approval can now archive this OpenSpec change and open or refresh the GitHub PR.";
    }

    if (lane.pullRequest?.status === "approved") {
      return "Human approval archived this lane's OpenSpec change and refreshed the GitHub PR for merge into the base branch.";
    }

    if (lane.pullRequest?.status === "failed") {
      return (
        lane.latestActivity ??
        "Machine review is complete, but final approval failed before the OpenSpec archive and GitHub PR delivery could finish."
      );
    }

    return "Coding and machine review are complete. Human feedback can start a fresh planning pass from this proposal or the whole request group.";
  }

  return lane.latestActivity ?? "Proposal work is active.";
};

export const getLaneApprovalAction = (lane: TeamWorkerLaneRecord): LaneApprovalAction | null => {
  if (lane.status === "awaiting_human_approval") {
    return {
      target: "proposal",
      buttonLabel: "Approve Proposal",
      pendingLabel: "Queueing proposal...",
      successNotice: "Proposal approval recorded. The coding-review queue is refreshing.",
      errorFallback: "Unable to approve this proposal.",
    };
  }

  if (lane.status !== "approved" || !lane.pullRequest) {
    return null;
  }

  if (lane.pullRequest.status === "awaiting_human_approval" && !lane.pullRequest.humanApprovedAt) {
    return {
      target: "pull_request",
      buttonLabel: "Approve and Open PR",
      pendingLabel: "Queueing archive pass...",
      successNotice:
        "Final approval recorded. The dedicated archive continuation is refreshing the OpenSpec change and GitHub PR.",
      errorFallback: "Unable to finalize this reviewed branch.",
    };
  }

  if (lane.pullRequest.status === "failed") {
    return {
      target: "pull_request",
      buttonLabel: "Retry Finalization",
      pendingLabel: "Retrying archive pass...",
      successNotice:
        "Final approval retried. The dedicated archive continuation is refreshing the OpenSpec change and GitHub PR.",
      errorFallback: "Unable to retry GitHub PR finalization.",
    };
  }

  return null;
};

export const getLaneStatusLabel = (lane: TeamWorkerLaneRecord): string => {
  if (lane.executionPhase === "final_archive" && lane.status === "queued") {
    return "Queued for Archive";
  }

  if (lane.executionPhase === "final_archive" && lane.status === "coding") {
    return "Archiving";
  }

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
      return lane.pullRequest?.status === "approved" ? "Completed" : "Machine Reviewed";
    case "failed":
      return "Failed";
  }
};

export const getLaneStatusClassName = (lane: TeamWorkerLaneRecord): string => {
  if (lane.status === "queued" && lane.pullRequest?.status === "conflict") {
    return "status-conflict";
  }

  if (lane.status === "approved" && lane.pullRequest?.status === "approved") {
    return "status-completed";
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
