import type { TeamThreadSummary } from "@/lib/team/history";
import type {
  TeamDispatchAssignment,
  TeamDispatchAssignmentStatus,
  TeamPullRequestRecord,
  TeamWorkerLaneCounts,
  TeamWorkerLaneRecord,
} from "@/lib/team/types";

export const THREAD_COMMAND_HELP_TEXT =
  "Supported commands: /approve [proposal-number], /ready [proposal-number], /replan [proposal-number] requirement, /replan-all requirement.";

export const THREAD_COMMAND_PLACEHOLDER = ["/approve, /ready, /replan, /replan-all"].join("\n");

export const THREAD_COMMAND_ARCHIVED_REASON =
  "Archived threads are read-only. Thread commands only run while the latest assignment is idle.";

export const THREAD_COMMAND_NO_ASSIGNMENT_REASON =
  "Thread commands are unavailable until the planner creates the first assignment for this thread.";

export const THREAD_COMMAND_BUSY_REASON =
  "Thread commands only run while the latest assignment is idle. Wait for queued, coding, or reviewing work to finish first.";

export const THREAD_COMMAND_REPLANNING_REASON =
  "Thread commands are unavailable while the latest assignment is being replanned. Wait for the refreshed proposal set before sending more commands.";

type ProposalCommandName = "approve" | "ready";

export type ThreadCommand =
  | {
      kind: ProposalCommandName;
      original: string;
      proposalNumber: number | null;
    }
  | {
      kind: "replan";
      original: string;
      proposalNumber: number;
      requirement: string;
    }
  | {
      kind: "replan-all";
      original: string;
      requirement: string;
    };

export class ThreadCommandParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThreadCommandParseError";
  }
}

const parsePositiveInteger = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }

  return Number.parseInt(value, 10);
};

const parseProposalCommand = (
  kind: ProposalCommandName,
  original: string,
  remainder: string,
): ThreadCommand => {
  if (!remainder) {
    return {
      kind,
      original,
      proposalNumber: null,
    };
  }

  const proposalNumber = parsePositiveInteger(remainder);
  if (!proposalNumber) {
    throw new ThreadCommandParseError(
      `Invalid syntax for /${kind}. Use /${kind} [proposal-number].`,
    );
  }

  return {
    kind,
    original,
    proposalNumber,
  };
};

export const parseThreadCommand = (input: string): ThreadCommand => {
  const original = input.trim();
  if (!original) {
    throw new ThreadCommandParseError("Enter a slash command.");
  }

  const [keyword = "", ...restTokens] = original.split(/\s+/);
  const remainder = restTokens.join(" ").trim();

  switch (keyword) {
    case "/approve":
      return parseProposalCommand("approve", original, remainder);
    case "/ready":
      return parseProposalCommand("ready", original, remainder);
    case "/replan": {
      const [proposalToken = "", ...requirementTokens] = restTokens;
      const proposalNumber = parsePositiveInteger(proposalToken);
      const requirement = requirementTokens.join(" ").trim();
      if (!proposalNumber || !requirement) {
        throw new ThreadCommandParseError(
          "Invalid syntax for /replan. Use /replan [proposal-number] requirement.",
        );
      }

      return {
        kind: "replan",
        original,
        proposalNumber,
        requirement,
      };
    }
    case "/replan-all": {
      if (!remainder) {
        throw new ThreadCommandParseError(
          "Invalid syntax for /replan-all. Use /replan-all requirement.",
        );
      }

      return {
        kind: "replan-all",
        original,
        requirement: remainder,
      };
    }
    default:
      throw new ThreadCommandParseError(
        "Unsupported command. Use /approve, /ready, /replan, or /replan-all.",
      );
  }
};

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

export const getThreadCommandDisabledReason = (
  thread: Pick<TeamThreadSummary, "archivedAt" | "latestAssignmentStatus" | "workerCounts">,
): string | null => {
  if (thread.archivedAt) {
    return THREAD_COMMAND_ARCHIVED_REASON;
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

const isProposalLane = (
  lane: Pick<TeamWorkerLaneRecord, "proposalChangeName" | "status" | "taskObjective" | "taskTitle">,
): boolean => {
  return (
    lane.status !== "idle" ||
    Boolean(lane.proposalChangeName || lane.taskTitle || lane.taskObjective)
  );
};

export const sortProposalLanes = <TLane extends Pick<TeamWorkerLaneRecord, "laneId" | "laneIndex">>(
  lanes: TLane[],
): TLane[] => {
  return [...lanes].sort(
    (left, right) => left.laneIndex - right.laneIndex || left.laneId.localeCompare(right.laneId),
  );
};

export const getCommandProposalLanes = (
  assignment: Pick<TeamDispatchAssignment, "lanes">,
): TeamWorkerLaneRecord[] => {
  return sortProposalLanes(assignment.lanes.filter((lane) => isProposalLane(lane)));
};

const hasRetryableFinalApprovalStatus = (
  pullRequest: Pick<TeamPullRequestRecord, "status"> | null,
): boolean => {
  return pullRequest?.status === "awaiting_human_approval" || pullRequest?.status === "failed";
};

export const getApproveCommandSkipReason = (
  lane: Pick<TeamWorkerLaneRecord, "status">,
): string | null => {
  if (lane.status === "awaiting_human_approval") {
    return null;
  }

  return "it is not awaiting proposal approval.";
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

  if (hasRetryableFinalApprovalStatus(lane.pullRequest)) {
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

  return null;
};
