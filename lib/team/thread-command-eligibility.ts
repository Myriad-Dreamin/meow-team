import type {
  TeamDispatchAssignment,
  TeamDispatchAssignmentStatus,
  TeamPullRequestRecord,
  TeamWorkerLaneCounts,
  TeamWorkerLaneRecord,
} from "@/lib/team/types";

export const THREAD_COMMAND_ARCHIVED_REASON =
  "Archived threads are read-only. Thread commands only run while the latest assignment is idle.";

export const THREAD_COMMAND_NO_ASSIGNMENT_REASON =
  "Thread commands are unavailable until the planner creates the first assignment for this thread.";

export const THREAD_COMMAND_BUSY_REASON =
  "Thread commands only run while the latest assignment is idle. Wait for queued, coding, or reviewing work to finish first.";

export const THREAD_COMMAND_REPLANNING_REASON =
  "Thread commands are unavailable while the latest assignment is being replanned. Wait for the refreshed proposal set before sending more commands.";

const hasActiveThreadCommandWork = (
  laneCounts: Pick<TeamWorkerLaneCounts, "queued" | "coding" | "reviewing">,
): boolean => {
  return laneCounts.queued > 0 || laneCounts.coding > 0 || laneCounts.reviewing > 0;
};

const hasReplanningThreadCommandStatus = (
  assignmentStatus: TeamDispatchAssignmentStatus | null | undefined,
): boolean => {
  return assignmentStatus === "planning" || assignmentStatus === "superseded";
};

export const getThreadCommandDisabledReason = (thread: {
  archivedAt: string | null;
  latestAssignmentStatus: TeamDispatchAssignmentStatus | null | undefined;
  plannerRetryAwaitingConfirmation?: boolean;
  workerCounts: Pick<TeamWorkerLaneCounts, "queued" | "coding" | "reviewing">;
}): string | null => {
  if (thread.archivedAt) {
    return THREAD_COMMAND_ARCHIVED_REASON;
  }

  if (thread.plannerRetryAwaitingConfirmation) {
    return null;
  }

  if (thread.latestAssignmentStatus === null) {
    return THREAD_COMMAND_NO_ASSIGNMENT_REASON;
  }

  if (hasReplanningThreadCommandStatus(thread.latestAssignmentStatus)) {
    return THREAD_COMMAND_REPLANNING_REASON;
  }

  if (hasActiveThreadCommandWork(thread.workerCounts)) {
    return THREAD_COMMAND_BUSY_REASON;
  }

  return null;
};

export const getAssignmentThreadCommandDisabledReason = ({
  archivedAt,
  assignment,
}: {
  archivedAt: string | null;
  assignment: Pick<TeamDispatchAssignment, "lanes" | "status" | "supersededAt">;
}): string | null => {
  if (archivedAt) {
    return THREAD_COMMAND_ARCHIVED_REASON;
  }

  if (assignment.supersededAt || hasReplanningThreadCommandStatus(assignment.status)) {
    return THREAD_COMMAND_REPLANNING_REASON;
  }

  if (
    assignment.lanes.some(
      (lane) => lane.status === "queued" || lane.status === "coding" || lane.status === "reviewing",
    )
  ) {
    return THREAD_COMMAND_BUSY_REASON;
  }

  return null;
};

const hasFinalApprovalWaitStatus = (
  pullRequest: Pick<TeamPullRequestRecord, "status"> | null,
): boolean => {
  return pullRequest?.status === "awaiting_human_approval";
};

const isFreshFinalApprovalWait = (
  pullRequest: Pick<TeamPullRequestRecord, "humanApprovedAt" | "status"> | null,
): boolean => {
  return hasFinalApprovalWaitStatus(pullRequest) && !pullRequest?.humanApprovedAt;
};

const hasRetryableFinalApprovalFailure = (
  pullRequest: Pick<TeamPullRequestRecord, "status"> | null,
): boolean => {
  return pullRequest?.status === "failed";
};

export const isLaneAwaitingHumanApprovalForCancel = (
  lane: Pick<TeamWorkerLaneRecord, "pullRequest" | "status">,
): boolean => {
  if (lane.status === "awaiting_human_approval" || lane.status === "awaiting_retry_approval") {
    return true;
  }

  return lane.status === "approved" && isFreshFinalApprovalWait(lane.pullRequest);
};

export const getCancelCommandSkipReason = (
  assignment: Pick<TeamDispatchAssignment, "cancelledAt" | "lanes" | "status">,
): string | null => {
  if (assignment.cancelledAt || assignment.status === "cancelled") {
    return "it is already cancelled.";
  }

  if (assignment.lanes.some(isLaneAwaitingHumanApprovalForCancel)) {
    return null;
  }

  return "the latest assignment is not waiting for human approval.";
};

export const getApproveCommandSkipReason = (
  lane: Pick<TeamWorkerLaneRecord, "status">,
): string | null => {
  if (lane.status === "awaiting_human_approval") {
    return null;
  }

  return "it is not awaiting proposal approval.";
};

export const getRetryCommandSkipReason = (
  lane: Pick<TeamWorkerLaneRecord, "retryState" | "status">,
): string | null => {
  if (lane.status === "awaiting_retry_approval" && lane.retryState?.awaitingConfirmationSince) {
    return null;
  }

  return "it is not waiting for agent retry confirmation.";
};

export const getReadyCommandSkipReason = (
  lane: Pick<TeamWorkerLaneRecord, "pullRequest" | "status">,
): string | null => {
  if (lane.status !== "approved") {
    return "it has not finished machine review yet.";
  }

  if (!lane.pullRequest) {
    return "it does not have final approval metadata yet.";
  }

  if (
    isFreshFinalApprovalWait(lane.pullRequest) ||
    hasRetryableFinalApprovalFailure(lane.pullRequest)
  ) {
    return null;
  }

  if (lane.pullRequest.status === "approved") {
    return "it has already been finalized.";
  }

  if (lane.pullRequest.status === "conflict") {
    return "it is waiting for a conflict-resolution pass before final approval.";
  }

  return "it is not ready for final approval.";
};

export const getReplanCommandSkipReason = (
  lane: Pick<TeamWorkerLaneRecord, "status">,
): string | null => {
  if (lane.status === "idle") {
    return "it does not have a proposal to revise yet.";
  }

  if (lane.status === "failed") {
    return "it is already failed and cannot accept proposal-scoped replanning.";
  }

  if (lane.status === "cancelled") {
    return "it has already been cancelled. Restart planning for the full request group instead.";
  }

  return null;
};
