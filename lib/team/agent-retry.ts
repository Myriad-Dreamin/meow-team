import "server-only";

import { teamConfig } from "@/team.config";
import { appendTeamCodexLogEvent } from "@/lib/team/logs";
import {
  appendLaneEvent,
  appendPlannerNote,
  findAssignment,
  findLane,
} from "@/lib/team/coding/shared";
import {
  getTeamThreadRecord,
  synchronizeDispatchAssignment,
  updateTeamThreadRecord,
} from "@/lib/team/history";
import { TeamThreadCommandError } from "@/lib/team/thread-command-error";
import type {
  TeamAgentRetryState,
  TeamCodexEvent,
  TeamWorkerEventActor,
  TeamWorkerLaneExecutionPhase,
} from "@/lib/team/types";

const AGENT_RETRY_DELAY_MS = 60_000;
const AGENT_RETRY_LIMIT = 10;

type ActiveRetryStatus = TeamAgentRetryState["resumeStatus"];

type RecordRetryFailureResult = {
  awaitingConfirmation: boolean;
  message: string;
};

const sleep = (delayMs: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
};

const describeError = (error: unknown): string => {
  return error instanceof Error ? error.message : "Agent execution failed.";
};

const formatRetryEventMessage = ({
  attempts,
  awaitingConfirmation,
  errorMessage,
  maxAttempts,
  roleName,
  round,
}: {
  attempts: number;
  awaitingConfirmation: boolean;
  errorMessage: string;
  maxAttempts: number;
  roleName: string;
  round: number;
}): string => {
  if (awaitingConfirmation) {
    return `${roleName} exhausted ${maxAttempts} automatic retry attempts in round ${round}. Waiting for human confirmation before starting another retry round. Last error: ${errorMessage}`;
  }

  return `${roleName} failed. Scheduling automatic retry attempt ${attempts}/${maxAttempts} in round ${round} after 1 minute. Last error: ${errorMessage}`;
};

const createRetryState = ({
  attempts,
  errorMessage,
  maxAttempts,
  nextRetryAt,
  retryState,
  roleId,
  roleName,
  resumeExecutionPhase,
  resumeStatus,
  awaitingConfirmationSince,
  now,
}: {
  attempts: number;
  errorMessage: string;
  maxAttempts: number;
  nextRetryAt: string | null;
  retryState: TeamAgentRetryState | null | undefined;
  roleId: string;
  roleName: string;
  resumeExecutionPhase: TeamWorkerLaneExecutionPhase;
  resumeStatus: ActiveRetryStatus;
  awaitingConfirmationSince: string | null;
  now: string;
}): TeamAgentRetryState => {
  return {
    roleId,
    roleName,
    attempts,
    maxAttempts,
    round: retryState?.roleId === roleId ? retryState.round : 1,
    nextRetryAt,
    awaitingConfirmationSince,
    resumeStatus,
    resumeExecutionPhase,
    lastError: errorMessage,
    updatedAt: now,
  };
};

export class TeamAgentRetryConfirmationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamAgentRetryConfirmationRequiredError";
  }
}

const recordLaneAgentRunFailure = async ({
  threadId,
  assignmentNumber,
  laneId,
  roleId,
  roleName,
  actor,
  resumeStatus,
  resumeExecutionPhase,
  errorMessage,
  delayMs,
  maxAttempts,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  roleId: string;
  roleName: string;
  actor: TeamWorkerEventActor;
  resumeStatus: ActiveRetryStatus;
  resumeExecutionPhase: TeamWorkerLaneExecutionPhase;
  errorMessage: string;
  delayMs: number;
  maxAttempts: number;
}): Promise<RecordRetryFailureResult> => {
  return updateTeamThreadRecord({
    threadFile: teamConfig.storage.threadFile,
    threadId,
    updater: (thread, now) => {
      const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
      const lane = findLane(assignment, laneId);
      const currentRetryState = lane.retryState;
      const currentAttempts = currentRetryState?.roleId === roleId ? currentRetryState.attempts : 0;
      const attempts = currentAttempts >= maxAttempts ? currentAttempts : currentAttempts + 1;
      const round = currentRetryState?.roleId === roleId ? currentRetryState.round : 1;
      const awaitingConfirmation = currentAttempts >= maxAttempts;
      const nextRetryAt = awaitingConfirmation
        ? null
        : new Date(new Date(now).getTime() + delayMs).toISOString();
      const message = formatRetryEventMessage({
        attempts,
        awaitingConfirmation,
        errorMessage,
        maxAttempts,
        roleName,
        round,
      });

      lane.retryState = createRetryState({
        attempts,
        errorMessage,
        maxAttempts,
        nextRetryAt,
        retryState: currentRetryState,
        roleId,
        roleName,
        resumeStatus,
        resumeExecutionPhase,
        awaitingConfirmationSince: awaitingConfirmation ? now : null,
        now,
      });
      lane.status = awaitingConfirmation ? "awaiting_retry_approval" : resumeStatus;
      lane.executionPhase = resumeExecutionPhase;
      lane.lastError = errorMessage;
      lane.latestActivity = message;
      lane.finishedAt = null;
      if (awaitingConfirmation) {
        lane.workerSlot = null;
        appendPlannerNote(
          assignment,
          `Proposal ${lane.laneIndex} paused after ${roleName} exhausted ${maxAttempts} automatic retries. Confirm retry to start another retry round.`,
          now,
        );
      }
      lane.updatedAt = now;
      appendLaneEvent(lane, actor, message, now);
      synchronizeDispatchAssignment(assignment, now);

      return {
        awaitingConfirmation,
        message,
      };
    },
  });
};

const clearLaneAgentRetryState = async ({
  threadId,
  assignmentNumber,
  laneId,
  roleId,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  roleId: string;
}): Promise<void> => {
  await updateTeamThreadRecord({
    threadFile: teamConfig.storage.threadFile,
    threadId,
    updater: (thread) => {
      const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
      const lane = findLane(assignment, laneId);

      if (lane.retryState?.roleId !== roleId) {
        return;
      }

      lane.retryState = null;
      lane.lastError = null;
    },
  });
};

const getPersistedRetryDelayMs = async ({
  threadId,
  assignmentNumber,
  laneId,
  roleId,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  roleId: string;
}): Promise<number> => {
  const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
  if (!thread) {
    return 0;
  }

  const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
  const lane = findLane(assignment, laneId);
  const retryState = lane.retryState;
  if (
    retryState?.roleId !== roleId ||
    retryState.awaitingConfirmationSince ||
    !retryState.nextRetryAt
  ) {
    return 0;
  }

  const nextRetryAtMs = Date.parse(retryState.nextRetryAt);
  if (!Number.isFinite(nextRetryAtMs)) {
    return 0;
  }

  return Math.max(0, nextRetryAtMs - Date.now());
};

const waitForPersistedRetryDelay = async ({
  threadId,
  assignmentNumber,
  laneId,
  roleId,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  roleId: string;
}): Promise<void> => {
  const delayMs = await getPersistedRetryDelayMs({
    threadId,
    assignmentNumber,
    laneId,
    roleId,
  });
  if (delayMs > 0) {
    await sleep(delayMs);
  }
};

export const confirmLaneAgentRetryRound = async ({
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
      const retryState = lane.retryState;

      if (lane.status !== "awaiting_retry_approval" || !retryState?.awaitingConfirmationSince) {
        throw new TeamThreadCommandError(
          "This proposal is not waiting for agent retry confirmation.",
          409,
        );
      }

      const nextRound = retryState.round + 1;
      lane.status = retryState.resumeStatus;
      lane.executionPhase = retryState.resumeExecutionPhase;
      lane.retryState = {
        ...retryState,
        attempts: 0,
        round: nextRound,
        nextRetryAt: null,
        awaitingConfirmationSince: null,
        lastError: null,
        updatedAt: now,
      };
      lane.lastError = null;
      lane.latestActivity = `Human confirmed ${retryState.roleName} retry round ${nextRound}. The agent can make another ${retryState.maxAttempts} automatic retry attempts.`;
      lane.finishedAt = null;
      lane.updatedAt = now;
      appendLaneEvent(lane, "human", lane.latestActivity, now);
      appendPlannerNote(
        assignment,
        `Human confirmed another ${retryState.roleName} retry round for proposal ${lane.laneIndex}.`,
        now,
      );
      synchronizeDispatchAssignment(assignment, now);
    },
  });
};

export const runLaneAgentWithRetry = async <T>({
  threadId,
  assignmentNumber,
  laneId,
  roleId,
  roleName,
  actor,
  resumeStatus,
  resumeExecutionPhase,
  run,
  delayMs = AGENT_RETRY_DELAY_MS,
  maxAttempts = AGENT_RETRY_LIMIT,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  roleId: string;
  roleName: string;
  actor: TeamWorkerEventActor;
  resumeStatus: ActiveRetryStatus;
  resumeExecutionPhase: TeamWorkerLaneExecutionPhase;
  run: () => Promise<T>;
  delayMs?: number;
  maxAttempts?: number;
}): Promise<T> => {
  while (true) {
    let result: T;
    try {
      await waitForPersistedRetryDelay({
        threadId,
        assignmentNumber,
        laneId,
        roleId,
      });
      result = await run();
    } catch (error) {
      const errorMessage = describeError(error);
      const retryResult = await recordLaneAgentRunFailure({
        threadId,
        assignmentNumber,
        laneId,
        roleId,
        roleName,
        actor,
        resumeStatus,
        resumeExecutionPhase,
        errorMessage,
        delayMs,
        maxAttempts,
      });

      const retryEvent: TeamCodexEvent = {
        source: "system",
        message: retryResult.message,
        createdAt: new Date().toISOString(),
      };
      await appendTeamCodexLogEvent({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        assignmentNumber,
        roleId,
        laneId,
        event: retryEvent,
      });

      if (retryResult.awaitingConfirmation) {
        throw new TeamAgentRetryConfirmationRequiredError(retryResult.message);
      }

      await sleep(delayMs);
      continue;
    }

    await clearLaneAgentRetryState({
      threadId,
      assignmentNumber,
      laneId,
      roleId,
    });
    return result;
  }
};
