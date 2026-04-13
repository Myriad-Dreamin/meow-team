import "server-only";

import { teamNetworkDispatchOps } from "@/lib/team/coding/dispatch";
import type {
  TeamRunCompletedState,
  TeamRunEnv,
  TeamRunReviewingStageState,
} from "@/lib/team/coding/shared";

export const runReviewingStage = async (
  env: TeamRunEnv,
  currentState: TeamRunReviewingStageState,
): Promise<TeamRunCompletedState> => {
  await teamNetworkDispatchOps.ensurePendingDispatchWork({
    threadId: currentState.threadId,
    dependencies: env.deps,
  });

  return {
    stage: "completed",
    args: currentState.args,
    result: currentState.result,
  };
};
