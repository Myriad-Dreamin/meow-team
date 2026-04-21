import { teamConfig } from "@/team.config";
import type { TeamRoleState } from "@/lib/team/agent-helpers";
import type { TeamRepositoryContext, TeamRepositoryOption } from "@/lib/git/repository";
import type {
  TeamDispatchAssignment,
  TeamRoleHandoff,
  TeamWorkerLaneRecord,
} from "@/lib/team/types";
import type { Worktree } from "@/lib/team/coding/worktree";

export type LanePullRequestDraft = {
  title: string;
  summary: string;
};

export type LaneRunState = TeamRoleState &
  TeamRepositoryContext & {
    teamName: string;
    ownerName: string;
    objective: string;
    laneId: string;
    laneIndex: number;
    executionPhase: TeamWorkerLaneRecord["executionPhase"];
    taskTitle: string;
    taskObjective: string;
    requestTitle: string;
    conventionalTitle: TeamDispatchAssignment["conventionalTitle"];
    planSummary: string;
    planDeliverable: string;
    conflictNote: string | null;
    archiveCommand: string | null;
    archivePathContext: string | null;
    pullRequestDraft: LanePullRequestDraft | null;
  };

const getHighestHandoffSequence = (handoffs: Partial<Record<string, TeamRoleHandoff>>): number => {
  return Object.values(handoffs).reduce((highestSequence, handoff) => {
    return handoff ? Math.max(highestSequence, handoff.sequence) : highestSequence;
  }, 0);
};

export const buildLaneRunState = ({
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
}): LaneRunState => {
  const archiveCommand =
    lane.executionPhase === "final_archive" && lane.proposalChangeName
      ? `/opsx:archive ${lane.proposalChangeName}`
      : null;

  return {
    teamName: teamConfig.name,
    ownerName: teamConfig.owner.name,
    objective: teamConfig.owner.objective,
    repository,
    laneId: lane.laneId,
    laneIndex: lane.laneIndex,
    executionPhase: lane.executionPhase ?? "implementation",
    taskTitle: lane.taskTitle ?? `Lane ${lane.laneIndex} task`,
    taskObjective:
      lane.taskObjective ?? assignment.plannerSummary ?? "Implement the assigned task.",
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
    pullRequestDraft: null,
  };
};
