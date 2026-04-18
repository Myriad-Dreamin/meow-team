import "server-only";

import { missingOpenAiConfigMessage, teamRuntimeConfig } from "@/lib/config/runtime";
import {
  createInitialTeamRunState,
  createTeamRunEnv,
  persistTeamRunState,
  prepareAssignmentReplan,
  runTeam,
} from "@/lib/team/coding";
import { markTeamThreadFailed } from "@/lib/team/history";
import { getTeamServerState } from "@/lib/team/server-state";
import type { TeamHumanFeedbackScope } from "@/lib/team/types";

export type LaneApprovalTarget = "proposal" | "pull_request";

export const runLaneApproval = async ({
  threadId,
  assignmentNumber,
  laneId,
  target = "proposal",
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  target?: LaneApprovalTarget;
}) => {
  const initialState = createInitialTeamRunState(
    target === "pull_request"
      ? {
          kind: "pull-request-approval",
          threadId,
          assignmentNumber,
          laneId,
        }
      : {
          kind: "proposal-approval",
          threadId,
          assignmentNumber,
          laneId,
        },
  );
  const env = createTeamRunEnv();
  await persistTeamRunState(env, initialState);
  await runTeam(env, initialState);
};

export const startAssignmentReplan = async ({
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
}) => {
  const serverState = await getTeamServerState();

  if (!teamRuntimeConfig.apiKey) {
    throw new Error(missingOpenAiConfigMessage);
  }

  const nextRun = await prepareAssignmentReplan({
    threadId,
    assignmentNumber,
    scope,
    laneId,
    suggestion,
  });
  const startedAt = new Date().toISOString();
  const initialState = createInitialTeamRunState({
    kind: "planning",
    input: nextRun.input,
    threadId,
    title: nextRun.title,
    requestText: nextRun.requestText,
    repositoryId: nextRun.repositoryId,
    reset: true,
  });
  const env = createTeamRunEnv();
  await persistTeamRunState(env, initialState);

  void runTeam(env, initialState).catch(async (error) => {
    const message = error instanceof Error ? error.message : "Unknown error.";
    console.error(`[team-feedback:${threadId}] ${message}`);
    await markTeamThreadFailed({
      threadFile: serverState.threadStorage,
      threadId,
      error: message,
    });
  });

  return {
    accepted: true as const,
    startedAt,
    status: "planning" as const,
    threadId,
  };
};
