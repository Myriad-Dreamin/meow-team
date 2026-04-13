import "server-only";

import { resolveTeamRoleDependencies } from "@/lib/team/roles/dependencies";
import { runArchivingStage } from "@/lib/team/coding/archiving";
import { runCodingStage } from "@/lib/team/coding/coding";
import {
  DispatchThreadCapacityError,
  TeamThreadReplanError,
  approveLaneProposal,
  approveLanePullRequest,
  assignPendingDispatchThreadSlots,
  assignPendingDispatchWorkerSlots,
  createPlannerDispatchAssignment,
  ensurePendingDispatchWork,
  prepareAssignmentReplan,
  queueLaneProposalForExecution,
  teamCodingDispatchOps,
  teamNetworkDispatchOps,
} from "@/lib/team/coding/dispatch";
import {
  buildPlanningStageState,
  handlePlanningStageError,
  isPlanningMachineState,
  runMetadataGenerationStage,
  runPlanningStage,
} from "@/lib/team/coding/plan";
import { runReviewingStage } from "@/lib/team/coding/reviewing";
import type {
  TeamRunArgs,
  TeamRunEnv,
  TeamRunMachineState,
  TeamRunResult,
} from "@/lib/team/coding/shared";

export type * from "@/lib/team/coding/shared";
export {
  DispatchThreadCapacityError,
  TeamThreadReplanError,
  approveLaneProposal,
  approveLanePullRequest,
  assignPendingDispatchThreadSlots,
  assignPendingDispatchWorkerSlots,
  createPlannerDispatchAssignment,
  ensurePendingDispatchWork,
  prepareAssignmentReplan,
  queueLaneProposalForExecution,
  teamCodingDispatchOps,
  teamNetworkDispatchOps,
};

const noopPersistState: TeamRunEnv["persistState"] = async () => undefined;

export const createInitialTeamRunState = (args: TeamRunArgs): TeamRunMachineState => {
  return {
    stage: "init",
    args,
  };
};

export const createTeamRunEnv = ({
  dependencies,
  persistState,
  onPlannerLogEntry,
}: {
  dependencies?: Parameters<typeof resolveTeamRoleDependencies>[0];
  persistState?: TeamRunEnv["persistState"];
  onPlannerLogEntry?: TeamRunEnv["onPlannerLogEntry"];
} = {}): TeamRunEnv => {
  return {
    deps: resolveTeamRoleDependencies(dependencies),
    persistState: persistState ?? noopPersistState,
    onPlannerLogEntry,
  };
};

export const persistTeamRunState = async (
  env: TeamRunEnv,
  state: TeamRunMachineState,
): Promise<void> => {
  await env.persistState(state);
};

const advanceTeamRunState = async (
  env: TeamRunEnv,
  currentState: TeamRunMachineState,
): Promise<TeamRunMachineState> => {
  switch (currentState.stage) {
    case "init":
      switch (currentState.args.kind) {
        case "planning":
          return buildPlanningStageState(env, currentState.args);
        case "proposal-approval":
          return {
            stage: "coding",
            args: currentState.args,
          };
        case "dispatch":
          return {
            stage: "reviewing",
            args: currentState.args,
            threadId: currentState.args.threadId,
            result: null,
          };
        case "pull-request-approval":
          return {
            stage: "archiving",
            args: currentState.args,
          };
      }
    case "planning":
      return runPlanningStage(env, currentState);
    case "metadata-generation":
      return runMetadataGenerationStage(env, currentState);
    case "coding":
      return runCodingStage(env, currentState);
    case "reviewing":
      return runReviewingStage(env, currentState);
    case "archiving":
      return runArchivingStage(env, currentState);
    case "completed":
      return currentState;
  }
};

export const runTeam = async (
  env: TeamRunEnv,
  initialState: TeamRunMachineState,
): Promise<TeamRunResult> => {
  let currentState = initialState;

  while (currentState.stage !== "completed") {
    try {
      currentState = await advanceTeamRunState(env, currentState);
      await env.persistState(currentState);
    } catch (error) {
      if (isPlanningMachineState(currentState)) {
        await handlePlanningStageError({
          env,
          currentState,
          error,
        });
      }

      throw error;
    }
  }

  return currentState.result;
};
