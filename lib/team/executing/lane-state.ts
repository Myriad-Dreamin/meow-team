import { teamConfig } from "@/team.config";
import type { TeamRoleState } from "@/lib/team/agent-helpers";
import type { TeamRepositoryContext, TeamRepositoryOption } from "@/lib/git/repository";
import {
  buildExecutionArtifactContract,
  buildExecutionGuideInstructions,
  resolveExecutionGuideContext,
  type ExecutionGuideContext,
} from "@/lib/team/executing/guidance";
import type {
  TeamDispatchAssignment,
  TeamRoleHandoff,
  TeamWorkerLaneRecord,
} from "@/lib/team/types";
import type { Worktree } from "@/lib/team/coding/worktree";
import type { TeamExecutionMode } from "@/lib/team/execution-mode";

export type ExecutionLanePullRequestDraft = {
  title: string;
  summary: string;
};

export type ExecutionLaneRunState = TeamRoleState &
  TeamRepositoryContext & {
    teamName: string;
    ownerName: string;
    objective: string;
    laneId: string;
    laneIndex: number;
    executionPhase: TeamWorkerLaneRecord["executionPhase"];
    executionMode: TeamExecutionMode;
    executionModeLabel: string;
    taskTitle: string;
    taskObjective: string;
    requestTitle: string;
    conventionalTitle: TeamDispatchAssignment["conventionalTitle"];
    planSummary: string;
    planDeliverable: string;
    conflictNote: string | null;
    archiveCommand: string | null;
    archivePathContext: string | null;
    guideContext: ExecutionGuideContext;
    guideInstructions: string;
    artifactContract: string;
    pullRequestDraft: ExecutionLanePullRequestDraft | null;
  };

const getHighestHandoffSequence = (handoffs: Partial<Record<string, TeamRoleHandoff>>): number => {
  return Object.values(handoffs).reduce((highestSequence, handoff) => {
    return handoff ? Math.max(highestSequence, handoff.sequence) : highestSequence;
  }, 0);
};

const resolveExecutionMode = (
  assignment: Pick<TeamDispatchAssignment, "executionMode" | "assignmentNumber">,
): TeamExecutionMode => {
  if (!assignment.executionMode) {
    throw new Error(`Assignment #${assignment.assignmentNumber} is missing execute-mode metadata.`);
  }

  return assignment.executionMode;
};

export const buildExecutionLaneRunState = async ({
  repository,
  worktree,
  lane,
  assignment,
  workflow,
  handoffs,
}: {
  repository: TeamRepositoryOption;
  worktree: Worktree;
  lane: TeamWorkerLaneRecord;
  assignment: TeamDispatchAssignment;
  workflow: string[];
  handoffs: Partial<Record<string, TeamRoleHandoff>>;
}): Promise<ExecutionLaneRunState> => {
  const executionMode = resolveExecutionMode(assignment);
  const archiveCommand =
    lane.executionPhase === "final_archive" && lane.proposalChangeName
      ? `/opsx:archive ${lane.proposalChangeName}`
      : null;
  const guideContext = await resolveExecutionGuideContext({
    worktreePath: worktree.path,
    executionMode,
  });

  return {
    teamName: teamConfig.name,
    ownerName: teamConfig.owner.name,
    objective: teamConfig.owner.objective,
    repository,
    laneId: lane.laneId,
    laneIndex: lane.laneIndex,
    executionPhase: lane.executionPhase ?? "implementation",
    executionMode,
    executionModeLabel: guideContext.executionModeLabel,
    taskTitle: lane.taskTitle ?? `Lane ${lane.laneIndex} task`,
    taskObjective: lane.taskObjective ?? assignment.plannerSummary ?? "Execute the assigned task.",
    requestTitle: assignment.requestTitle ?? lane.taskTitle ?? `Proposal ${lane.laneIndex}`,
    conventionalTitle: assignment.conventionalTitle ?? null,
    planSummary: assignment.plannerSummary ?? "No planner summary provided.",
    planDeliverable: assignment.plannerDeliverable ?? "No planner deliverable provided.",
    branchName: lane.branchName ?? `lane-${lane.laneIndex}`,
    baseBranch: lane.baseBranch ?? teamConfig.dispatch.baseBranch,
    worktree,
    implementationCommit: lane.latestImplementationCommit,
    conflictNote:
      lane.requeueReason === "planner_detected_conflict"
        ? "Planner detected a pull request conflict. Resolve the branch and prepare it for review again."
        : null,
    archiveCommand,
    archivePathContext: lane.proposalPath,
    workflow,
    handoffs,
    handoffCounter: getHighestHandoffSequence(handoffs),
    assignmentNumber: assignment.assignmentNumber,
    guideContext,
    guideInstructions: buildExecutionGuideInstructions(guideContext),
    artifactContract: buildExecutionArtifactContract(executionMode),
    pullRequestDraft: null,
  };
};
