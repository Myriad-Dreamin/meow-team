import "server-only";

import { teamConfig } from "@/team.config";
import {
  getTeamThreadRecord,
  synchronizeDispatchAssignment,
  updateTeamThreadRecord,
} from "@/lib/team/history";
import { resolveTeamRoleDependencies } from "@/lib/team/roles/dependencies";
import { runArchivingStage } from "@/lib/team/coding/archiving";
import { runCodingStage } from "@/lib/team/coding/coding";
import {
  assignPendingDispatchThreadSlots,
  assignPendingDispatchWorkerSlots,
} from "@/lib/team/coding/dispatch-worktrees";
import {
  DispatchThreadCapacityError,
  TeamThreadReplanError,
  appendLaneEvent,
  appendPlannerNote,
  findAssignment,
  findLane,
} from "@/lib/team/coding/shared";
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
import { createWorktree } from "@/lib/team/coding/worktree";
import { runPlanningStateWithRetry } from "@/lib/team/planner-retry";
import type {
  TeamDispatchAssignment,
  TeamHumanFeedbackScope,
  TeamWorkerLaneRecord,
} from "@/lib/team/types";

export type * from "@/lib/team/coding/shared";
export type * from "@/lib/team/coding/worktree";
export {
  DispatchThreadCapacityError,
  TeamThreadReplanError,
  assignPendingDispatchThreadSlots,
  assignPendingDispatchWorkerSlots,
  createWorktree,
};

const noopPersistState: TeamRunEnv["persistState"] = async () => undefined;

const createHumanFeedback = ({
  scope,
  laneId,
  message,
  createdAt,
}: {
  scope: TeamHumanFeedbackScope;
  laneId: string | null;
  message: string;
  createdAt: string;
}) => {
  return {
    id: crypto.randomUUID(),
    scope,
    laneId,
    message,
    createdAt,
  };
};

const buildProposalSnapshot = (assignment: TeamDispatchAssignment): string => {
  const implementationLabel = assignment.executionMode
    ? "Latest execution summary"
    : "Latest coding summary";
  const reviewLabel = assignment.executionMode
    ? "Latest execution review"
    : "Latest machine review";

  return assignment.lanes
    .filter((lane) => lane.taskTitle || lane.taskObjective)
    .map((lane) => {
      return [
        `Proposal ${lane.laneIndex}: ${lane.taskTitle ?? "Untitled proposal"}`,
        `Objective: ${lane.taskObjective ?? "No objective recorded."}`,
        `Status: ${lane.status}`,
        lane.latestCoderSummary ? `${implementationLabel}: ${lane.latestCoderSummary}` : null,
        lane.latestReviewerSummary ? `${reviewLabel}: ${lane.latestReviewerSummary}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
};

const buildFeedbackReplanInput = ({
  originalRequest,
  assignment,
  scope,
  lane,
  suggestion,
}: {
  originalRequest: string;
  assignment: TeamDispatchAssignment;
  scope: TeamHumanFeedbackScope;
  lane: TeamWorkerLaneRecord | null;
  suggestion: string;
}): string => {
  return [
    `Original request:\n${originalRequest}`,
    assignment.executionMode ? `Execution mode:\n${assignment.executionMode}` : null,
    assignment.requestTitle ? `Current request title:\n${assignment.requestTitle}` : null,
    assignment.plannerSummary ? `Latest planner summary:\n${assignment.plannerSummary}` : null,
    assignment.canonicalBranchName
      ? `Canonical branch namespace:\n${assignment.canonicalBranchName}`
      : null,
    `Current proposal set:\n${buildProposalSnapshot(assignment) || "No proposals recorded yet."}`,
    scope === "proposal" && lane
      ? [
          `Human feedback for proposal ${lane.laneIndex} (${lane.taskTitle ?? "Untitled proposal"}):`,
          suggestion,
          "Regenerate the proposal set with this proposal adjusted first while keeping the request group coherent.",
        ].join("\n")
      : [
          "Human feedback for the full request group:",
          suggestion,
          "Regenerate the proposal set so the next planning pass reflects this updated direction.",
        ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
};

export const prepareAssignmentReplan = async ({
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
}): Promise<{
  input: string;
  title: string | undefined;
  requestText: string;
  executionMode: TeamDispatchAssignment["executionMode"];
  repositoryId: string | undefined;
}> => {
  const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
  if (!thread) {
    throw new TeamThreadReplanError("not_found", `Thread ${threadId} was not found.`, 404);
  }

  if (thread.archivedAt) {
    throw new TeamThreadReplanError("archived", "Archived threads cannot restart planning.", 409);
  }

  const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
  if (assignment.supersededAt) {
    throw new TeamThreadReplanError(
      "superseded",
      "This request group has already been superseded by newer feedback.",
      409,
    );
  }

  const hasActiveQueue = assignment.lanes.some(
    (lane) => lane.status === "queued" || lane.status === "coding" || lane.status === "reviewing",
  );
  if (hasActiveQueue) {
    throw new TeamThreadReplanError(
      "active_queue",
      "Wait for the active coding-review queue to finish before restarting planning with human feedback.",
      409,
    );
  }

  const targetLane = scope === "proposal" ? findLane(assignment, laneId ?? "") : null;
  const originalRequest =
    assignment.requestText ?? thread.data.requestText ?? thread.data.latestInput;
  if (!originalRequest) {
    throw new Error("The original request could not be recovered for replanning.");
  }

  await updateTeamThreadRecord({
    threadFile: teamConfig.storage.threadFile,
    threadId,
    updater: (mutableThread, now) => {
      const mutableAssignment = findAssignment(mutableThread.dispatchAssignments, assignmentNumber);
      mutableAssignment.humanFeedback = [
        ...mutableAssignment.humanFeedback,
        createHumanFeedback({
          scope,
          laneId: targetLane?.laneId ?? null,
          message: suggestion,
          createdAt: now,
        }),
      ];
      mutableAssignment.supersededAt = now;
      mutableAssignment.supersededReason =
        scope === "proposal"
          ? `Human requested proposal-specific changes for ${targetLane?.taskTitle ?? targetLane?.laneId ?? "the selected proposal"}.`
          : "Human requested request-group changes.";

      if (targetLane) {
        const mutableLane = findLane(mutableAssignment, targetLane.laneId);
        mutableLane.latestActivity =
          "Human requested proposal-specific changes and sent this request group back to planning.";
        mutableLane.updatedAt = now;
        appendLaneEvent(
          mutableLane,
          "human",
          `Human feedback requested replanning: ${suggestion}`,
          now,
        );
      }

      appendPlannerNote(
        mutableAssignment,
        scope === "proposal"
          ? `Human requested new planning guidance for proposal ${targetLane?.laneIndex}.`
          : "Human requested new planning guidance for the full request group.",
        now,
      );
      synchronizeDispatchAssignment(mutableAssignment, now);
    },
  });

  return {
    input: buildFeedbackReplanInput({
      originalRequest,
      assignment,
      scope,
      lane: targetLane,
      suggestion,
    }),
    title: assignment.requestTitle ?? thread.data.requestTitle ?? undefined,
    requestText: originalRequest,
    executionMode: assignment.executionMode,
    repositoryId: thread.data.selectedRepository?.id,
  };
};

const resolveThreadRunWorktree = async (threadId: string) => {
  const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
  if (!thread?.data.threadWorktree?.slot) {
    throw new Error(
      `Thread ${threadId} is missing the claimed meow worktree required for repository-backed execution.`,
    );
  }

  return thread.data.threadWorktree;
};

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
            worktree: await resolveThreadRunWorktree(currentState.args.threadId),
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
            worktree: await resolveThreadRunWorktree(currentState.args.threadId),
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
    if (isPlanningMachineState(currentState)) {
      currentState = await runPlanningStateWithRetry({
        advance: (planningState) => advanceTeamRunState(env, planningState),
        currentState,
        env,
        onTerminalError: handlePlanningStageError,
      });
      await env.persistState(currentState);
      continue;
    }

    currentState = await advanceTeamRunState(env, currentState);
    await env.persistState(currentState);
  }

  return currentState.result;
};
