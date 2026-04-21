import "server-only";

import { teamConfig } from "@/team.config";
import { ExistingBranchesRequireDeleteError } from "@/lib/team/git";
import { getTeamThreadRecord, updateTeamThreadRecord } from "@/lib/team/history";
import { appendTeamCodexLogEvent } from "@/lib/team/logs";
import { TeamThreadCommandError } from "@/lib/team/thread-command-error";
import type {
  TeamPlannerRetryResumeState,
  TeamPlannerRetryState,
  TeamRunEnv,
  TeamRunMachineState,
  TeamRunMetadataGenerationStageState,
  TeamRunPlanningStageState,
} from "@/lib/team/coding/shared";
import type { TeamCodexEvent } from "@/lib/team/types";

const PLANNER_RETRY_DELAY_MS = 60_000;
const PLANNER_RETRY_LIMIT = 10;

type PlanningRetryMachineState = TeamRunPlanningStageState | TeamRunMetadataGenerationStageState;

type RecordPlannerRetryFailureResult = {
  awaitingConfirmation: boolean;
  message: string;
};

const sleep = (delayMs: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
};

const describeError = (error: unknown): string => {
  return error instanceof Error ? error.message : "Planner execution failed.";
};

const serializePlannerRetryResumeState = (
  state: PlanningRetryMachineState,
): TeamPlannerRetryResumeState => {
  const context = {
    threadId: state.context.threadId,
    worktree: state.context.worktree,
    selectedRepository: state.context.selectedRepository,
    shouldResetAssignment: state.context.shouldResetAssignment,
    state: state.context.state,
    requestMetadata: state.context.requestMetadata,
  };

  if (state.stage === "planning") {
    return {
      stage: "planning",
      args: state.args,
      context,
    };
  }

  return {
    stage: "metadata-generation",
    args: state.args,
    context,
    plannerResponse: state.plannerResponse,
    plannerRoleName: state.plannerRoleName,
  };
};

const hydratePlannerRetryResumeState = async (
  resumeState: TeamPlannerRetryResumeState,
): Promise<PlanningRetryMachineState> => {
  const existingThread = await getTeamThreadRecord(
    teamConfig.storage.threadFile,
    resumeState.context.threadId,
  );
  const context = {
    ...resumeState.context,
    existingThread,
  };

  if (resumeState.stage === "planning") {
    return {
      stage: "planning",
      args: resumeState.args,
      context,
    };
  }

  return {
    stage: "metadata-generation",
    args: resumeState.args,
    context,
    plannerResponse: resumeState.plannerResponse,
    plannerRoleName: resumeState.plannerRoleName,
  };
};

const formatPlannerRetryEventMessage = ({
  attempts,
  awaitingConfirmation,
  errorMessage,
  maxAttempts,
  round,
}: {
  attempts: number;
  awaitingConfirmation: boolean;
  errorMessage: string;
  maxAttempts: number;
  round: number;
}): string => {
  if (awaitingConfirmation) {
    return `Planner exhausted ${maxAttempts} automatic retry attempts in round ${round}. Waiting for human confirmation before starting another retry round. Last error: ${errorMessage}`;
  }

  return `Planner failed. Scheduling automatic retry attempt ${attempts}/${maxAttempts} in round ${round} after 1 minute. Last error: ${errorMessage}`;
};

const createPlannerRetryState = ({
  attempts,
  awaitingConfirmationSince,
  errorMessage,
  maxAttempts,
  nextRetryAt,
  now,
  retryState,
  state,
}: {
  attempts: number;
  awaitingConfirmationSince: string | null;
  errorMessage: string;
  maxAttempts: number;
  nextRetryAt: string | null;
  now: string;
  retryState: TeamPlannerRetryState | null | undefined;
  state: PlanningRetryMachineState;
}): TeamPlannerRetryState => {
  return {
    roleId: "planner",
    roleName: "Planner",
    attempts,
    maxAttempts,
    round: retryState?.roleId === "planner" ? retryState.round : 1,
    nextRetryAt,
    awaitingConfirmationSince,
    lastError: errorMessage,
    updatedAt: now,
    resumeState: serializePlannerRetryResumeState(state),
  };
};

const recordPlannerRunFailure = async ({
  currentState,
  delayMs,
  errorMessage,
  maxAttempts,
}: {
  currentState: PlanningRetryMachineState;
  delayMs: number;
  errorMessage: string;
  maxAttempts: number;
}): Promise<RecordPlannerRetryFailureResult> => {
  const { threadId } = currentState.context;

  return updateTeamThreadRecord({
    threadFile: teamConfig.storage.threadFile,
    threadId,
    updater: (thread, now) => {
      const currentRetryState = thread.run?.plannerRetryState;
      const currentAttempts =
        currentRetryState?.roleId === "planner" ? currentRetryState.attempts : 0;
      const attempts = currentAttempts >= maxAttempts ? currentAttempts : currentAttempts + 1;
      const awaitingConfirmation = currentAttempts >= maxAttempts;
      const round = currentRetryState?.roleId === "planner" ? currentRetryState.round : 1;
      const nextRetryAt = awaitingConfirmation
        ? null
        : new Date(new Date(now).getTime() + delayMs).toISOString();
      const message = formatPlannerRetryEventMessage({
        attempts,
        awaitingConfirmation,
        errorMessage,
        maxAttempts,
        round,
      });

      thread.run = {
        status: awaitingConfirmation ? "failed" : "planning",
        startedAt: thread.run?.startedAt ?? thread.createdAt,
        finishedAt: awaitingConfirmation ? now : null,
        lastError: errorMessage,
        plannerRetryState: createPlannerRetryState({
          attempts,
          awaitingConfirmationSince: awaitingConfirmation ? now : null,
          errorMessage,
          maxAttempts,
          nextRetryAt,
          now,
          retryState: currentRetryState,
          state: currentState,
        }),
      };

      return {
        awaitingConfirmation,
        message,
      };
    },
  });
};

const clearPlannerRetryState = async ({
  clearLastError = true,
  threadId,
}: {
  clearLastError?: boolean;
  threadId: string;
}): Promise<void> => {
  await updateTeamThreadRecord({
    threadFile: teamConfig.storage.threadFile,
    threadId,
    updater: (thread) => {
      if (!thread.run?.plannerRetryState) {
        return;
      }

      thread.run = {
        status: thread.run.status,
        startedAt: thread.run.startedAt ?? thread.createdAt,
        finishedAt: thread.run.finishedAt ?? null,
        lastError: clearLastError ? null : (thread.run.lastError ?? null),
        plannerRetryState: null,
      };
    },
  });
};

const isRetryablePlannerError = (error: unknown): boolean => {
  return !(error instanceof ExistingBranchesRequireDeleteError);
};

export class TeamPlannerRetryConfirmationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamPlannerRetryConfirmationRequiredError";
  }
}

export const confirmPlannerRetryRound = async ({
  threadId,
}: {
  threadId: string;
}): Promise<PlanningRetryMachineState> => {
  let resumeState: TeamPlannerRetryResumeState | null = null;

  await updateTeamThreadRecord({
    threadFile: teamConfig.storage.threadFile,
    threadId,
    updater: (thread, now) => {
      const retryState = thread.run?.plannerRetryState;

      if (!retryState?.awaitingConfirmationSince) {
        throw new TeamThreadCommandError(
          "This thread is not waiting for planner retry confirmation.",
          409,
        );
      }

      const nextRound = retryState.round + 1;
      resumeState = retryState.resumeState;
      thread.run = {
        status: "planning",
        startedAt: thread.run?.startedAt ?? thread.createdAt,
        finishedAt: null,
        lastError: null,
        plannerRetryState: {
          ...retryState,
          attempts: 0,
          round: nextRound,
          nextRetryAt: null,
          awaitingConfirmationSince: null,
          lastError: null,
          updatedAt: now,
        },
      };
    },
  });

  if (!resumeState) {
    throw new TeamThreadCommandError(
      "This thread is not waiting for planner retry confirmation.",
      409,
    );
  }

  return hydratePlannerRetryResumeState(resumeState);
};

export const runPlanningStateWithRetry = async ({
  advance,
  currentState,
  delayMs = PLANNER_RETRY_DELAY_MS,
  env,
  maxAttempts = PLANNER_RETRY_LIMIT,
  onTerminalError,
}: {
  advance: (state: PlanningRetryMachineState) => Promise<TeamRunMachineState>;
  currentState: PlanningRetryMachineState;
  delayMs?: number;
  env: TeamRunEnv;
  maxAttempts?: number;
  onTerminalError: (args: {
    currentState: PlanningRetryMachineState;
    env: TeamRunEnv;
    error: unknown;
  }) => Promise<void>;
}): Promise<TeamRunMachineState> => {
  while (true) {
    try {
      const nextState = await advance(currentState);
      await clearPlannerRetryState({
        threadId: currentState.context.threadId,
      });
      return nextState;
    } catch (error) {
      if (!isRetryablePlannerError(error)) {
        await clearPlannerRetryState({
          clearLastError: false,
          threadId: currentState.context.threadId,
        });
        await onTerminalError({
          currentState,
          env,
          error,
        });
        throw error;
      }

      const errorMessage = describeError(error);
      const retryResult = await recordPlannerRunFailure({
        currentState,
        delayMs,
        errorMessage,
        maxAttempts,
      });

      const retryEvent: TeamCodexEvent = {
        source: "system",
        message: retryResult.message,
        createdAt: new Date().toISOString(),
      };
      await appendTeamCodexLogEvent({
        threadFile: teamConfig.storage.threadFile,
        threadId: currentState.context.threadId,
        assignmentNumber: currentState.context.state.assignmentNumber,
        roleId: "planner",
        laneId: null,
        event: retryEvent,
      });

      if (retryResult.awaitingConfirmation) {
        throw new TeamPlannerRetryConfirmationRequiredError(retryResult.message);
      }

      await sleep(delayMs);
    }
  }
};
