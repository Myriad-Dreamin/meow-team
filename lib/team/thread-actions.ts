import "server-only";

import { missingOpenAiConfigMessage, teamRuntimeConfig } from "@/lib/config/runtime";
import { teamConfig } from "@/team.config";
import {
  createInitialTeamRunState,
  createTeamRunEnv,
  persistTeamRunState,
  prepareAssignmentReplan,
  runTeam,
} from "@/lib/team/coding";
import { findAssignment, findLane } from "@/lib/team/coding/shared";
import { getLaneFinalizationMode } from "@/lib/team/finalization";
import { markTeamThreadFailed } from "@/lib/team/history";
import { getTeamThreadRecord } from "@/lib/team/history";
import { getTeamServerState } from "@/lib/team/server-state";
import type { TeamHumanFeedbackScope, TeamLaneFinalizationMode } from "@/lib/team/types";

export type LaneApprovalTarget = "proposal" | "pull_request";

export const runLaneApproval = async ({
  threadId,
  assignmentNumber,
  laneId,
  target = "proposal",
  finalizationMode,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  target?: LaneApprovalTarget;
  finalizationMode?: TeamLaneFinalizationMode;
}) => {
  const initialState =
    target === "pull_request"
      ? createInitialTeamRunState({
          kind: "pull-request-approval",
          threadId,
          assignmentNumber,
          laneId,
          finalizationMode: await (async (): Promise<TeamLaneFinalizationMode> => {
            if (finalizationMode) {
              return finalizationMode;
            }

            const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
            if (!thread) {
              throw new Error(
                `Thread ${threadId} was not found in ${teamConfig.storage.threadFile}.`,
              );
            }

            const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
            const lane = findLane(assignment, laneId);
            return getLaneFinalizationMode(lane) ?? "archive";
          })(),
        })
      : createInitialTeamRunState({
          kind: "proposal-approval",
          threadId,
          assignmentNumber,
          laneId,
        });
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
    executionMode: nextRun.executionMode,
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
