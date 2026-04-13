import "server-only";

import { teamConfig } from "@/team.config";
import { getTeamThreadRecord } from "@/lib/team/history";
import { teamNetworkDispatchOps } from "@/lib/team/coding/dispatch";
import { findPersistedLane, isLanePullRequestFinalized } from "@/lib/team/coding/plan";
import type {
  TeamRunArchivingStageState,
  TeamRunCompletedState,
  TeamRunEnv,
} from "@/lib/team/coding/shared";

export const runArchivingStage = async (
  env: TeamRunEnv,
  currentState: TeamRunArchivingStageState,
): Promise<TeamRunCompletedState> => {
  const persistedThread = await getTeamThreadRecord(
    teamConfig.storage.threadFile,
    currentState.args.threadId,
  );
  const persistedLane = findPersistedLane(
    persistedThread,
    currentState.args.assignmentNumber,
    currentState.args.laneId,
  );

  if (!persistedLane || !isLanePullRequestFinalized(persistedLane)) {
    await teamNetworkDispatchOps.approveLanePullRequest({
      threadId: currentState.args.threadId,
      assignmentNumber: currentState.args.assignmentNumber,
      laneId: currentState.args.laneId,
      createWorktree: env.createWorktree,
      dependencies: env.deps,
    });
  }

  return {
    stage: "completed",
    args: currentState.args,
    result: null,
  };
};
