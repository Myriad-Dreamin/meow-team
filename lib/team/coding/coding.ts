import "server-only";

import { teamConfig } from "@/team.config";
import { getTeamThreadRecord } from "@/lib/team/history";
import { teamNetworkDispatchOps } from "@/lib/team/coding/dispatch";
import { findPersistedLane, isLaneQueuedForExecution } from "@/lib/team/coding/plan";
import type {
  TeamRunCodingStageState,
  TeamRunEnv,
  TeamRunReviewingStageState,
} from "@/lib/team/coding/shared";
import type { TeamWorkerLaneRecord } from "@/lib/team/types";

export const runCodingStage = async (
  env: TeamRunEnv,
  currentState: TeamRunCodingStageState,
): Promise<TeamRunReviewingStageState> => {
  const persistedThread = await getTeamThreadRecord(
    teamConfig.storage.threadFile,
    currentState.args.threadId,
  );
  const persistedLane = findPersistedLane(
    persistedThread,
    currentState.args.assignmentNumber,
    currentState.args.laneId,
  );

  if (!persistedLane || persistedLane.status === "awaiting_human_approval") {
    await teamNetworkDispatchOps.approveLaneProposal({
      threadId: currentState.args.threadId,
      assignmentNumber: currentState.args.assignmentNumber,
      laneId: currentState.args.laneId,
      dependencies: env.deps,
    });
  } else if (!isLaneQueuedForExecution(persistedLane as TeamWorkerLaneRecord)) {
    throw new Error("This proposal is not waiting for human approval.");
  }

  return {
    stage: "reviewing",
    args: currentState.args,
    threadId: currentState.args.threadId,
    result: null,
  };
};
