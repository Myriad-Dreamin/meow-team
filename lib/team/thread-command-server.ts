import "server-only";

import { teamConfig } from "@/team.config";
import type { LaneApprovalTarget } from "@/lib/team/thread-actions";
import {
  cancelThreadApprovalWait,
  runLaneApproval,
  startAssignmentReplan,
} from "@/lib/team/thread-actions";
import {
  getApproveCommandSkipReason,
  getAssignmentThreadCommandDisabledReason,
  getCancelCommandSkipReason,
  getCommandProposalLanes,
  THREAD_COMMAND_NO_ASSIGNMENT_REASON,
  getReadyCommandSkipReason,
  getReplanCommandSkipReason,
  parseThreadCommand,
  type ThreadCommand,
} from "@/lib/team/thread-command";
import { TeamThreadCommandError } from "@/lib/team/thread-command-error";
import { getTeamThreadRecord, type TeamThreadRecord } from "@/lib/team/history";
import type { TeamDispatchAssignment, TeamWorkerLaneRecord } from "@/lib/team/types";
export { TeamThreadCommandError } from "@/lib/team/thread-command-error";

type ThreadCommandResultOutcome = "success" | "partial" | "skipped" | "accepted";

export type ThreadCommandResult = {
  ok: true;
  assignmentNumber: number;
  commandName: ThreadCommand["kind"];
  details: string[];
  message: string;
  outcome: ThreadCommandResultOutcome;
};

export type ThreadCommandExecutors = {
  cancelApprovalWait: (args: { assignmentNumber: number; threadId: string }) => Promise<void>;
  runApproval: (args: {
    assignmentNumber: number;
    laneId: string;
    target: LaneApprovalTarget;
    threadId: string;
  }) => Promise<void>;
  startReplan: typeof startAssignmentReplan;
};

type BatchSkip = {
  proposalNumber: number;
  reason: string;
};

const defaultExecutors: ThreadCommandExecutors = {
  cancelApprovalWait: cancelThreadApprovalWait,
  runApproval: runLaneApproval,
  startReplan: startAssignmentReplan,
};

const getLatestAssignment = (
  thread: Pick<TeamThreadRecord, "dispatchAssignments">,
): TeamDispatchAssignment | null => {
  return (
    [...thread.dispatchAssignments]
      .sort((left, right) => left.assignmentNumber - right.assignmentNumber)
      .at(-1) ?? null
  );
};

const joinList = (items: string[]): string => {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0] ?? "";
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
};

const formatProposalList = (proposalNumbers: number[]): string => {
  const numbers = joinList(proposalNumbers.map((proposalNumber) => String(proposalNumber)));
  return `${proposalNumbers.length === 1 ? "proposal" : "proposals"} ${numbers}`;
};

const createResult = ({
  assignmentNumber,
  commandName,
  details,
  outcome,
}: {
  assignmentNumber: number;
  commandName: ThreadCommand["kind"];
  details: string[];
  outcome: ThreadCommandResultOutcome;
}): ThreadCommandResult => {
  return {
    ok: true,
    assignmentNumber,
    commandName,
    details,
    message: details.join(" "),
    outcome,
  };
};

const getRequiredAssignment = (thread: TeamThreadRecord): TeamDispatchAssignment => {
  const latestAssignment = getLatestAssignment(thread);
  if (!latestAssignment) {
    throw new TeamThreadCommandError(THREAD_COMMAND_NO_ASSIGNMENT_REASON, 409);
  }

  const disabledReason = getAssignmentThreadCommandDisabledReason({
    archivedAt: thread.archivedAt,
    assignment: latestAssignment,
  });
  if (disabledReason) {
    throw new TeamThreadCommandError(disabledReason, 409);
  }

  return latestAssignment;
};

const findProposalLane = (
  assignment: TeamDispatchAssignment,
  proposalNumber: number,
): TeamWorkerLaneRecord => {
  const lane = getCommandProposalLanes(assignment).find(
    (candidate) => candidate.laneIndex === proposalNumber,
  );
  if (!lane) {
    throw new TeamThreadCommandError(
      `Proposal ${proposalNumber} was not found on the latest assignment.`,
      400,
    );
  }

  return lane;
};

const buildBatchSummary = ({
  actionSentence,
  assignmentNumber,
  commandName,
  emptySentence,
  failureSentence,
  skipped,
  succeeded,
}: {
  actionSentence: (proposalNumbers: number[]) => string;
  assignmentNumber: number;
  commandName: ThreadCommand["kind"];
  emptySentence: string;
  failureSentence: string | null;
  skipped: BatchSkip[];
  succeeded: number[];
}) => {
  const details: string[] = [];

  if (succeeded.length > 0) {
    details.push(actionSentence(succeeded));
  }

  if (skipped.length > 0) {
    details.push(
      `Skipped ${joinList(
        skipped.map(({ proposalNumber, reason }) => `proposal ${proposalNumber} because ${reason}`),
      )}.`,
    );
  }

  if (succeeded.length === 0 && skipped.length === 0) {
    details.push(emptySentence);
  }

  if (failureSentence) {
    details.push(failureSentence);
  }

  const outcome: ThreadCommandResultOutcome =
    failureSentence || (succeeded.length > 0 && skipped.length > 0)
      ? "partial"
      : succeeded.length > 0
        ? "success"
        : "skipped";

  return createResult({
    assignmentNumber,
    commandName,
    details,
    outcome,
  });
};

const executeApprovalCommand = async ({
  assignment,
  command,
  executors,
  singleSuccessMessage,
  skipReasonForLane,
  successSentence,
  target,
  threadId,
}: {
  assignment: TeamDispatchAssignment;
  command: Extract<ThreadCommand, { kind: "approve" | "ready" }>;
  executors: ThreadCommandExecutors;
  singleSuccessMessage: (proposalNumber: number) => string;
  skipReasonForLane: (lane: Pick<TeamWorkerLaneRecord, "pullRequest" | "status">) => string | null;
  successSentence: (proposalNumbers: number[]) => string;
  target: LaneApprovalTarget;
  threadId: string;
}): Promise<ThreadCommandResult> => {
  const lanes = getCommandProposalLanes(assignment);

  if (command.proposalNumber !== null) {
    const lane = findProposalLane(assignment, command.proposalNumber);
    const skipReason = skipReasonForLane(lane);
    if (skipReason) {
      return createResult({
        assignmentNumber: assignment.assignmentNumber,
        commandName: command.kind,
        details: [`Skipped proposal ${lane.laneIndex} because ${skipReason}`],
        outcome: "skipped",
      });
    }

    await executors.runApproval({
      assignmentNumber: assignment.assignmentNumber,
      laneId: lane.laneId,
      target,
      threadId,
    });

    return createResult({
      assignmentNumber: assignment.assignmentNumber,
      commandName: command.kind,
      details: [singleSuccessMessage(lane.laneIndex)],
      outcome: "success",
    });
  }

  const succeeded: number[] = [];
  const skipped: BatchSkip[] = [];
  let failureSentence: string | null = null;

  for (const lane of lanes) {
    const skipReason = skipReasonForLane(lane);
    if (skipReason) {
      skipped.push({
        proposalNumber: lane.laneIndex,
        reason: skipReason,
      });
      continue;
    }

    try {
      await executors.runApproval({
        assignmentNumber: assignment.assignmentNumber,
        laneId: lane.laneId,
        target,
        threadId,
      });
      succeeded.push(lane.laneIndex);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The command runner failed before the remaining proposals could be processed.";
      failureSentence = `Stopped on proposal ${lane.laneIndex}: ${message}`;
      break;
    }
  }

  return buildBatchSummary({
    actionSentence: successSentence,
    assignmentNumber: assignment.assignmentNumber,
    commandName: command.kind,
    emptySentence:
      command.kind === "approve"
        ? "No latest-assignment proposals were awaiting proposal approval."
        : "No latest-assignment proposals were ready for final approval.",
    failureSentence,
    skipped,
    succeeded,
  });
};

const executeCancelCommand = async ({
  assignment,
  executors,
  threadId,
}: {
  assignment: TeamDispatchAssignment;
  executors: ThreadCommandExecutors;
  threadId: string;
}): Promise<ThreadCommandResult> => {
  const skipReason = getCancelCommandSkipReason(assignment);
  if (skipReason) {
    return createResult({
      assignmentNumber: assignment.assignmentNumber,
      commandName: "cancel",
      details: [`Skipped request-group cancellation because ${skipReason}`],
      outcome: "skipped",
    });
  }

  await executors.cancelApprovalWait({
    threadId,
    assignmentNumber: assignment.assignmentNumber,
  });

  return createResult({
    assignmentNumber: assignment.assignmentNumber,
    commandName: "cancel",
    details: [
      `Cancelled request group for assignment ${assignment.assignmentNumber}. Archive it later if you want to move it out of the active list.`,
    ],
    outcome: "success",
  });
};

export const executeThreadCommandForThread = async ({
  command,
  executors = defaultExecutors,
  thread,
}: {
  command: ThreadCommand;
  executors?: ThreadCommandExecutors;
  thread: TeamThreadRecord;
}): Promise<ThreadCommandResult> => {
  const assignment = getRequiredAssignment(thread);

  switch (command.kind) {
    case "cancel":
      return executeCancelCommand({
        assignment,
        executors,
        threadId: thread.threadId,
      });
    case "approve":
      return executeApprovalCommand({
        assignment,
        command,
        executors,
        singleSuccessMessage: (proposalNumber) =>
          `Proposal ${proposalNumber} approval recorded. Coding and review were queued.`,
        skipReasonForLane: getApproveCommandSkipReason,
        successSentence: (proposalNumbers) =>
          `Queued proposal approval for ${formatProposalList(proposalNumbers)}.`,
        target: "proposal",
        threadId: thread.threadId,
      });
    case "ready":
      return executeApprovalCommand({
        assignment,
        command,
        executors,
        singleSuccessMessage: (proposalNumber) =>
          `Proposal ${proposalNumber} final approval recorded. The finalization continuation was queued.`,
        skipReasonForLane: getReadyCommandSkipReason,
        successSentence: (proposalNumbers) =>
          `Queued final approval for ${formatProposalList(proposalNumbers)}.`,
        target: "pull_request",
        threadId: thread.threadId,
      });
    case "replan": {
      const lane = findProposalLane(assignment, command.proposalNumber);
      const skipReason = getReplanCommandSkipReason(lane);
      if (skipReason) {
        return createResult({
          assignmentNumber: assignment.assignmentNumber,
          commandName: command.kind,
          details: [`Skipped proposal ${lane.laneIndex} because ${skipReason}`],
          outcome: "skipped",
        });
      }

      await executors.startReplan({
        threadId: thread.threadId,
        assignmentNumber: assignment.assignmentNumber,
        scope: "proposal",
        laneId: lane.laneId,
        suggestion: command.requirement,
      });

      return createResult({
        assignmentNumber: assignment.assignmentNumber,
        commandName: command.kind,
        details: [
          `Accepted replanning for proposal ${lane.laneIndex}. Planner restart is in progress.`,
        ],
        outcome: "accepted",
      });
    }
    case "replan-all":
      await executors.startReplan({
        threadId: thread.threadId,
        assignmentNumber: assignment.assignmentNumber,
        scope: "assignment",
        suggestion: command.requirement,
      });

      return createResult({
        assignmentNumber: assignment.assignmentNumber,
        commandName: command.kind,
        details: [
          `Accepted request-group replanning for assignment ${assignment.assignmentNumber}. Planner restart is in progress.`,
        ],
        outcome: "accepted",
      });
  }
};

export const executeThreadCommand = async ({
  commandText,
  threadId,
}: {
  commandText: string;
  threadId: string;
}): Promise<ThreadCommandResult> => {
  const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
  if (!thread) {
    throw new TeamThreadCommandError(`Thread ${threadId} was not found.`, 404);
  }

  const command = parseThreadCommand(commandText);
  return executeThreadCommandForThread({
    command,
    thread,
  });
};
