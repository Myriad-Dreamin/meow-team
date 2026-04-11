import "server-only";

import path from "node:path";
import { teamConfig } from "@/team.config";
import { applyHandoff, type TeamRoleState } from "@/lib/team/agent-helpers";
import {
  archiveOpenSpecChangeInWorktree,
  buildCanonicalBranchName,
  buildLaneBranchName,
  buildLaneWorktreePath,
  commitWorktreeChanges,
  createOrUpdateGitHubPullRequest,
  deleteManagedBranches,
  detectBranchConflict,
  ensureLaneWorktree,
  ExistingBranchesRequireDeleteError,
  getBranchHead,
  hasWorktreeChanges,
  listExistingBranches,
  pushLaneBranch,
  resolveRepositoryBaseBranch,
  tryRebaseWorktreeBranch,
  resolveWorktreeRoot,
} from "@/lib/team/git";
import {
  getTeamThreadRecord,
  listPendingDispatchAssignments,
  type PendingDispatchAssignment,
  synchronizeDispatchAssignment,
  updateTeamThreadRecord,
} from "@/lib/team/history";
import { appendTeamCodexLogEvent } from "@/lib/team/logs";
import {
  buildProposalChangeName,
  buildProposalPath,
  materializeAssignmentProposals,
} from "@/lib/team/openspec";
import { loadRolePrompt } from "@/lib/team/prompts";
import type { TeamRepositoryOption } from "@/lib/team/repository-types";
import {
  resolveTeamRoleDependencies,
  type TeamRoleDependencies,
} from "@/lib/team/roles/dependencies";
import type {
  TeamDispatchAssignment,
  TeamHumanFeedbackScope,
  TeamPlannerNote,
  TeamPullRequestRecord,
  TeamRoleHandoff,
  TeamWorkerEventActor,
  TeamWorkerLaneRecord,
} from "@/lib/team/types";

type DispatchTask = {
  title: string;
  objective: string;
};

type LanePullRequestDraft = {
  title: string;
  summary: string;
};

type LaneRunState = TeamRoleState & {
  teamName: string;
  ownerName: string;
  objective: string;
  repository: TeamRepositoryOption;
  laneId: string;
  laneIndex: number;
  taskTitle: string;
  taskObjective: string;
  planSummary: string;
  planDeliverable: string;
  branchName: string;
  baseBranch: string;
  worktreePath: string;
  implementationCommit: string | null;
  conflictNote: string | null;
  pullRequestDraft: LanePullRequestDraft | null;
};

const activeLaneRuns = new Map<string, Promise<void>>();

const laneRunKey = (threadId: string, assignmentNumber: number, laneId: string): string => {
  return `${threadId}:${assignmentNumber}:${laneId}`;
};

const createLaneEvent = (actor: TeamWorkerEventActor, message: string, createdAt: string) => {
  return {
    id: crypto.randomUUID(),
    actor,
    message,
    createdAt,
  };
};

const createPlannerNote = (message: string, createdAt: string): TeamPlannerNote => {
  return {
    id: crypto.randomUUID(),
    message,
    createdAt,
  };
};

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

const findAssignment = (
  dispatchAssignments: TeamDispatchAssignment[],
  assignmentNumber: number,
): TeamDispatchAssignment => {
  const assignment = dispatchAssignments.find(
    (candidate) => candidate.assignmentNumber === assignmentNumber,
  );

  if (!assignment) {
    throw new Error(`Assignment #${assignmentNumber} was not found.`);
  }

  return assignment;
};

const findLane = (assignment: TeamDispatchAssignment, laneId: string): TeamWorkerLaneRecord => {
  const lane = assignment.lanes.find((candidate) => candidate.laneId === laneId);
  if (!lane) {
    throw new Error(`Lane ${laneId} was not found in assignment #${assignment.assignmentNumber}.`);
  }

  return lane;
};

const appendPlannerNote = (
  assignment: TeamDispatchAssignment,
  message: string,
  now: string,
): void => {
  assignment.plannerNotes = [...assignment.plannerNotes, createPlannerNote(message, now)];
};

const appendLaneEvent = (
  lane: TeamWorkerLaneRecord,
  actor: TeamWorkerEventActor,
  message: string,
  now: string,
): void => {
  lane.events = [...lane.events, createLaneEvent(actor, message, now)];
};

const getLaneWorkflow = (): string[] => {
  return teamConfig.workflow.filter((roleId) => roleId === "coder" || roleId === "reviewer");
};

const getHighestHandoffSequence = (handoffs: Partial<Record<string, TeamRoleHandoff>>): number => {
  return Object.values(handoffs).reduce((highestSequence, handoff) => {
    return handoff ? Math.max(highestSequence, handoff.sequence) : highestSequence;
  }, 0);
};

const inferReviewerDecisionFromLane = (
  lane: Pick<
    TeamWorkerLaneRecord,
    "latestDecision" | "latestReviewerSummary" | "requeueReason" | "status" | "updatedAt"
  >,
): TeamRoleHandoff["decision"] | null => {
  if (!lane.latestReviewerSummary) {
    return null;
  }

  if (lane.requeueReason === "reviewer_requested_changes") {
    return "needs_revision";
  }

  if (lane.requeueReason === "planner_detected_conflict" || lane.status === "approved") {
    return "approved";
  }

  if (lane.latestDecision === "approved" || lane.latestDecision === "needs_revision") {
    return lane.latestDecision;
  }

  return null;
};

const buildSyntheticReviewerHandoff = (
  lane: Pick<
    TeamWorkerLaneRecord,
    | "latestDecision"
    | "latestReviewerSummary"
    | "requeueReason"
    | "status"
    | "updatedAt"
    | "finishedAt"
  >,
  assignmentNumber: number,
  sequence: number,
): TeamRoleHandoff | null => {
  if (!lane.latestReviewerSummary) {
    return null;
  }

  const decision = inferReviewerDecisionFromLane(lane);
  if (!decision) {
    return null;
  }

  return {
    roleId: "reviewer",
    roleName: "Reviewer",
    summary: lane.latestReviewerSummary,
    deliverable: lane.latestReviewerSummary,
    decision,
    sequence,
    assignmentNumber,
    updatedAt: lane.finishedAt ?? lane.updatedAt,
  };
};

const buildLanePersistedHandoffs = ({
  lane,
  assignmentNumber,
}: {
  lane: TeamWorkerLaneRecord;
  assignmentNumber: number;
}): Partial<Record<string, TeamRoleHandoff>> => {
  const handoffs: Partial<Record<string, TeamRoleHandoff>> = {};

  if (lane.latestCoderHandoff) {
    handoffs.coder = lane.latestCoderHandoff;
  }

  const reviewerHandoff =
    lane.latestReviewerHandoff ??
    buildSyntheticReviewerHandoff(
      lane,
      assignmentNumber,
      Math.max((lane.latestCoderHandoff?.sequence ?? 0) + 1, 1),
    );

  if (reviewerHandoff) {
    handoffs.reviewer = reviewerHandoff;
  }

  return handoffs;
};

const buildLaneInitialState = ({
  repository,
  lane,
  assignment,
  workflow,
  handoffs,
}: {
  repository: TeamRepositoryOption;
  lane: TeamWorkerLaneRecord;
  assignment: TeamDispatchAssignment;
  workflow: string[];
  handoffs: Partial<Record<string, TeamRoleHandoff>>;
}): LaneRunState => {
  return {
    teamName: teamConfig.name,
    ownerName: teamConfig.owner.name,
    objective: teamConfig.owner.objective,
    repository,
    laneId: lane.laneId,
    laneIndex: lane.laneIndex,
    taskTitle: lane.taskTitle ?? `Lane ${lane.laneIndex} task`,
    taskObjective:
      lane.taskObjective ?? assignment.plannerSummary ?? "Implement the assigned task.",
    planSummary: assignment.plannerSummary ?? "No planner summary provided.",
    planDeliverable: assignment.plannerDeliverable ?? "No planner deliverable provided.",
    branchName: lane.branchName ?? `lane-${lane.laneIndex}`,
    baseBranch: lane.baseBranch ?? teamConfig.dispatch.baseBranch,
    worktreePath:
      lane.worktreePath ??
      resolveWorktreeRoot({
        repositoryPath: repository.path,
        worktreeRoot: teamConfig.dispatch.worktreeRoot,
      }),
    implementationCommit: lane.latestImplementationCommit,
    conflictNote:
      lane.requeueReason === "planner_detected_conflict"
        ? "Planner detected a pull request conflict. Resolve the branch and prepare it for review again."
        : null,
    workflow,
    handoffs,
    handoffCounter: getHighestHandoffSequence(handoffs),
    assignmentNumber: assignment.assignmentNumber,
    pullRequestDraft: null,
  };
};

const buildCoderCommitMessage = ({
  lane,
}: {
  lane: Pick<TeamWorkerLaneRecord, "laneIndex" | "taskTitle" | "requeueReason">;
}): string => {
  const taskLabel = lane.taskTitle?.trim() || `proposal ${lane.laneIndex}`;

  if (lane.requeueReason === "reviewer_requested_changes") {
    return `coder: address review feedback for ${taskLabel}`;
  }

  if (lane.requeueReason === "planner_detected_conflict") {
    return `coder: resolve conflict for ${taskLabel}`;
  }

  return `coder: implement ${taskLabel}`;
};

const noBranchOutputMessage =
  "Coder completed without producing a new branch commit. The lane was stopped to avoid an infinite coder/reviewer loop.";

const shortenCommit = (commit: string): string => {
  return commit.slice(0, 12);
};

const summarizeGitFailure = (message: string): string => {
  return (
    message
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "Git operation failed."
  );
};

const createPullRequestRecord = ({
  threadId,
  assignmentNumber,
  lane,
  draft,
  now,
}: {
  threadId: string;
  assignmentNumber: number;
  lane: TeamWorkerLaneRecord;
  draft: LanePullRequestDraft;
  now: string;
}): TeamPullRequestRecord => {
  return {
    id: `pr-${threadId.slice(0, 8)}-a${assignmentNumber}-lane-${lane.laneIndex}`,
    provider: "local-ci",
    title: draft.title,
    summary: draft.summary,
    branchName: lane.branchName ?? `lane-${lane.laneIndex}`,
    baseBranch: lane.baseBranch ?? teamConfig.dispatch.baseBranch,
    status: "awaiting_human_approval",
    requestedAt: now,
    humanApprovalRequestedAt: now,
    humanApprovedAt: null,
    machineReviewedAt: now,
    updatedAt: now,
    url: null,
  };
};

const buildLaneFinalizationWorktreePath = ({
  repositoryPath,
  threadId,
  assignmentNumber,
  laneId,
}: {
  repositoryPath: string;
  threadId: string;
  assignmentNumber: number;
  laneId: string;
}): string => {
  const worktreeRoot = resolveWorktreeRoot({
    repositoryPath,
    worktreeRoot: teamConfig.dispatch.worktreeRoot,
  });
  const encodedLaneKey = Buffer.from(`${threadId}:${assignmentNumber}:${laneId}`, "utf8").toString(
    "hex",
  );

  return path.join(worktreeRoot, `finalize-${encodedLaneKey}`);
};

const createProposalLane = ({
  threadId,
  laneIndex,
  task,
  branchPrefix,
  assignmentNumber,
  baseBranch,
}: {
  threadId: string;
  laneIndex: number;
  task: DispatchTask;
  branchPrefix: string;
  assignmentNumber: number;
  baseBranch: string;
}): TeamWorkerLaneRecord => {
  const laneId = `lane-${laneIndex}`;
  const now = new Date().toISOString();

  const branchName = buildLaneBranchName({
    threadId,
    branchPrefix,
    assignmentNumber,
    laneIndex,
  });
  const proposalChangeName = buildProposalChangeName({
    branchPrefix,
    assignmentNumber,
    laneIndex,
    taskTitle: task.title,
  });

  return {
    laneId,
    laneIndex,
    status: "awaiting_human_approval",
    taskTitle: task.title,
    taskObjective: task.objective,
    proposalChangeName,
    proposalPath: buildProposalPath(proposalChangeName),
    workerSlot: null,
    branchName,
    baseBranch,
    worktreePath: null,
    latestImplementationCommit: null,
    pushedCommit: null,
    latestCoderHandoff: null,
    latestReviewerHandoff: null,
    latestDecision: null,
    latestCoderSummary: null,
    latestReviewerSummary: null,
    latestActivity: "Proposal is waiting for human approval before coding and review begin.",
    approvalRequestedAt: now,
    approvalGrantedAt: null,
    queuedAt: null,
    runCount: 0,
    revisionCount: 0,
    requeueReason: null,
    lastError: null,
    pullRequest: null,
    events: [createLaneEvent("planner", `Planner proposed: ${task.title}`, now)],
    startedAt: null,
    finishedAt: null,
    updatedAt: now,
  };
};

export const createPlannerDispatchAssignment = async ({
  threadId,
  assignmentNumber,
  repository,
  requestTitle,
  requestText,
  plannerSummary,
  plannerDeliverable,
  branchPrefix,
  tasks,
  deleteExistingBranches = false,
}: {
  threadId: string;
  assignmentNumber: number;
  repository: TeamRepositoryOption | null;
  requestTitle: string;
  requestText: string;
  plannerSummary: string;
  plannerDeliverable: string;
  branchPrefix: string;
  tasks: DispatchTask[];
  deleteExistingBranches?: boolean;
}): Promise<TeamDispatchAssignment> => {
  if (!repository) {
    throw new Error("Dispatching coder and reviewer lanes requires a selected repository.");
  }

  const now = new Date().toISOString();
  const resolvedBaseBranch = await resolveRepositoryBaseBranch(
    repository.path,
    teamConfig.dispatch.baseBranch,
  );
  const resolvedWorktreeRoot = resolveWorktreeRoot({
    repositoryPath: repository.path,
    worktreeRoot: teamConfig.dispatch.worktreeRoot,
  });
  const canonicalBranchName = buildCanonicalBranchName({
    threadId,
    branchPrefix,
    assignmentNumber,
  });

  const assignment: TeamDispatchAssignment = synchronizeDispatchAssignment(
    {
      assignmentNumber,
      status: "planning",
      repository,
      requestTitle,
      requestText,
      requestedAt: now,
      startedAt: now,
      finishedAt: null,
      updatedAt: now,
      plannerSummary,
      plannerDeliverable,
      branchPrefix,
      canonicalBranchName,
      baseBranch: resolvedBaseBranch,
      workerCount: teamConfig.dispatch.workerCount,
      lanes: tasks.map((task, index) =>
        createProposalLane({
          threadId,
          laneIndex: index + 1,
          task,
          branchPrefix,
          assignmentNumber,
          baseBranch: resolvedBaseBranch,
        }),
      ),
      plannerNotes: [
        createPlannerNote(
          `Planner created ${tasks.length} proposal${tasks.length === 1 ? "" : "s"} and is waiting for human approval before the coding-review queue starts.`,
          now,
        ),
      ],
      humanFeedback: [],
      supersededAt: null,
      supersededReason: null,
    },
    now,
  );

  const targetBranchNames = [
    canonicalBranchName,
    ...assignment.lanes.flatMap((lane) => (lane.branchName ? [lane.branchName] : [])),
  ];
  const existingBranches = await listExistingBranches({
    repositoryPath: repository.path,
    branchNames: targetBranchNames,
  });

  if (existingBranches.length > 0) {
    if (!deleteExistingBranches) {
      throw new ExistingBranchesRequireDeleteError(existingBranches);
    }

    await deleteManagedBranches({
      repositoryPath: repository.path,
      worktreeRoot: resolvedWorktreeRoot,
      branchNames: existingBranches,
    });
    assignment.plannerNotes = [
      createPlannerNote(
        `Human confirmed deletion of existing branches before rematerializing proposals: ${existingBranches.join(", ")}.`,
        now,
      ),
      ...assignment.plannerNotes,
    ];
  }

  await materializeAssignmentProposals({
    threadId,
    assignmentNumber,
    repositoryPath: repository.path,
    baseBranch: resolvedBaseBranch,
    canonicalBranchName,
    plannerSummary,
    plannerDeliverable,
    requestInput: requestText,
    worktreeRoot: resolvedWorktreeRoot,
    lanes: assignment.lanes,
  });

  await updateTeamThreadRecord({
    threadFile: teamConfig.storage.threadFile,
    threadId,
    updater: (thread) => {
      thread.dispatchAssignments = [
        ...thread.dispatchAssignments.filter(
          (candidate) => candidate.assignmentNumber !== assignment.assignmentNumber,
        ),
        assignment,
      ].sort((left, right) => left.assignmentNumber - right.assignmentNumber);
    },
  });

  return assignment;
};

const isPoolOccupyingLaneStatus = (status: TeamWorkerLaneRecord["status"]): boolean => {
  return status === "queued" || status === "coding" || status === "reviewing";
};

type PendingDispatchLaneAllocation = {
  pending: PendingDispatchAssignment;
  lane: TeamWorkerLaneRecord;
  worktreeRoot: string;
};

type LanePoolSchedulingState = Pick<TeamWorkerLaneRecord, "status" | "workerSlot" | "worktreePath">;

type PlannedLanePoolState = {
  expected: LanePoolSchedulingState;
  planned: Pick<TeamWorkerLaneRecord, "workerSlot" | "worktreePath">;
};

const buildLanePoolStateKey = ({
  threadId,
  assignmentNumber,
  laneId,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
}): string => {
  return `${threadId}:${assignmentNumber}:${laneId}`;
};

const captureLanePoolSchedulingState = (lane: TeamWorkerLaneRecord): LanePoolSchedulingState => {
  return {
    status: lane.status,
    workerSlot: lane.workerSlot,
    worktreePath: lane.worktreePath,
  };
};

const lanePoolSchedulingStateMatches = (
  lane: TeamWorkerLaneRecord,
  expected: LanePoolSchedulingState,
): boolean => {
  return (
    lane.status === expected.status &&
    lane.workerSlot === expected.workerSlot &&
    lane.worktreePath === expected.worktreePath
  );
};

const comparePendingDispatchLaneAllocation = (
  left: PendingDispatchLaneAllocation,
  right: PendingDispatchLaneAllocation,
): number => {
  const leftQueuedAt = left.lane.queuedAt ?? left.lane.updatedAt;
  const rightQueuedAt = right.lane.queuedAt ?? right.lane.updatedAt;

  return (
    leftQueuedAt.localeCompare(rightQueuedAt) ||
    left.pending.threadId.localeCompare(right.pending.threadId) ||
    left.pending.assignment.assignmentNumber - right.pending.assignment.assignmentNumber ||
    left.lane.laneIndex - right.lane.laneIndex
  );
};

export const assignPendingDispatchWorkerSlots = ({
  pendingAssignments,
  workerCount,
  resolveAssignmentWorktreeRoot,
}: {
  pendingAssignments: PendingDispatchAssignment[];
  workerCount: number;
  resolveAssignmentWorktreeRoot: (pending: PendingDispatchAssignment) => string;
}): void => {
  const occupiedSlots = new Set<number>();
  let preservedLaneCount = 0;
  const queuedLanes: PendingDispatchLaneAllocation[] = [];

  for (const pending of pendingAssignments) {
    if (!pending.assignment.repository) {
      continue;
    }

    const worktreeRoot = resolveAssignmentWorktreeRoot(pending);

    for (const lane of pending.assignment.lanes) {
      if (!isPoolOccupyingLaneStatus(lane.status)) {
        continue;
      }

      if (lane.workerSlot) {
        preservedLaneCount += 1;
        if (lane.workerSlot >= 1 && lane.workerSlot <= workerCount) {
          occupiedSlots.add(lane.workerSlot);
        }
        lane.worktreePath ??= buildLaneWorktreePath({
          worktreeRoot,
          laneIndex: lane.workerSlot,
        });
        continue;
      }

      if (lane.status === "queued") {
        queuedLanes.push({
          pending,
          lane,
          worktreeRoot,
        });
      }
    }
  }

  const remainingCapacity = Math.max(0, workerCount - preservedLaneCount);
  const availableSlots = Array.from({ length: workerCount }, (_, index) => index + 1)
    .filter((slot) => !occupiedSlots.has(slot))
    .slice(0, remainingCapacity);

  for (const { lane, worktreeRoot } of queuedLanes.sort(comparePendingDispatchLaneAllocation)) {
    const slot = availableSlots.shift();
    if (!slot) {
      break;
    }

    lane.workerSlot = slot;
    lane.worktreePath = buildLaneWorktreePath({
      worktreeRoot,
      laneIndex: slot,
    });
  }
};

const runLaneCycle = async ({
  threadId,
  assignmentNumber,
  laneId,
  dependencies,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  dependencies: TeamRoleDependencies;
}): Promise<void> => {
  while (true) {
    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
    if (!thread) {
      return;
    }

    const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
    const lane = findLane(assignment, laneId);
    if (lane.status !== "queued" && lane.status !== "coding" && lane.status !== "reviewing") {
      return;
    }

    if (!lane.workerSlot || !lane.worktreePath) {
      return;
    }

    if (!assignment.repository || !lane.worktreePath || !lane.branchName || !lane.baseBranch) {
      throw new Error("Lane is missing repository, branch, or worktree metadata.");
    }

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        mutableLane.status = "coding";
        mutableLane.lastError = null;
        mutableLane.latestImplementationCommit = null;
        mutableLane.pushedCommit = null;
        mutableLane.startedAt = mutableLane.startedAt ?? now;
        mutableLane.finishedAt = null;
        mutableLane.latestActivity =
          mutableLane.requeueReason === "planner_detected_conflict"
            ? "Coder is resolving a planner-detected pull request conflict."
            : mutableLane.requeueReason === "reviewer_requested_changes"
              ? "Coder is addressing reviewer-requested changes."
              : "Coder is implementing the approved proposal in the dedicated worktree.";
        mutableLane.updatedAt = now;
        appendLaneEvent(mutableLane, "coder", mutableLane.latestActivity, now);
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });

    await ensureLaneWorktree({
      repositoryPath: assignment.repository.path,
      worktreeRoot: resolveWorktreeRoot({
        repositoryPath: assignment.repository.path,
        worktreeRoot: teamConfig.dispatch.worktreeRoot,
      }),
      worktreePath: lane.worktreePath,
      branchName: lane.branchName,
      startPoint: assignment.canonicalBranchName ?? lane.baseBranch,
    });

    const branchHeadBeforeCoding = await getBranchHead({
      repositoryPath: assignment.repository.path,
      branchName: lane.branchName,
    });

    const coderRole = await loadRolePrompt("coder");
    const coderState = buildLaneInitialState({
      repository: assignment.repository,
      lane,
      assignment,
      workflow: getLaneWorkflow(),
      handoffs: buildLanePersistedHandoffs({
        lane,
        assignmentNumber,
      }),
    });
    const coderResponse = await dependencies.coderRole(
      {
        role: coderRole,
        state: coderState,
        input:
          lane.taskObjective ??
          lane.taskTitle ??
          assignment.plannerSummary ??
          "Implement the task.",
        onEvent: async (event) => {
          await appendTeamCodexLogEvent({
            threadFile: teamConfig.storage.threadFile,
            threadId,
            assignmentNumber,
            roleId: coderRole.id,
            laneId,
            event,
          });
        },
      },
      dependencies.executor,
    );

    const coderHandoff = applyHandoff({
      state: coderState,
      role: coderRole,
      summary: coderResponse.summary,
      deliverable: coderResponse.deliverable,
      decision: coderResponse.decision,
    });

    if (await hasWorktreeChanges(lane.worktreePath)) {
      await commitWorktreeChanges({
        worktreePath: lane.worktreePath,
        message: buildCoderCommitMessage({
          lane,
        }),
      });
    }

    const branchHeadAfterCoding = await getBranchHead({
      repositoryPath: assignment.repository.path,
      branchName: lane.branchName,
    });

    if (branchHeadAfterCoding === branchHeadBeforeCoding) {
      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (mutableThread, now) => {
          const mutableAssignment = findAssignment(
            mutableThread.dispatchAssignments,
            assignmentNumber,
          );
          const mutableLane = findLane(mutableAssignment, laneId);
          mutableLane.status = "failed";
          mutableLane.latestImplementationCommit = null;
          mutableLane.pushedCommit = null;
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
          mutableLane.latestDecision = coderHandoff.decision;
          mutableLane.latestActivity = "Coder finished without producing branch output.";
          mutableLane.lastError = noBranchOutputMessage;
          mutableLane.runCount += 1;
          mutableLane.workerSlot = null;
          mutableLane.worktreePath = null;
          mutableLane.updatedAt = now;
          mutableLane.finishedAt = now;
          appendLaneEvent(mutableLane, "coder", `Coder handoff: ${coderHandoff.summary}`, now);
          appendLaneEvent(mutableLane, "system", noBranchOutputMessage, now);
          appendPlannerNote(
            mutableAssignment,
            `Lane ${mutableLane.laneIndex} stopped because the coder produced no branch output.`,
            now,
          );
          synchronizeDispatchAssignment(mutableAssignment, now);
        },
      });

      await appendTeamCodexLogEvent({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        assignmentNumber,
        roleId: coderRole.id,
        laneId,
        event: {
          source: "system",
          message: noBranchOutputMessage,
          createdAt: new Date().toISOString(),
        },
      });

      return;
    }

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        const reviewCommit = shortenCommit(branchHeadAfterCoding);
        mutableLane.status = "reviewing";
        mutableLane.latestImplementationCommit = branchHeadAfterCoding;
        mutableLane.pushedCommit = null;
        mutableLane.latestCoderHandoff = coderHandoff;
        mutableLane.latestCoderSummary = coderHandoff.summary;
        mutableLane.latestDecision = coderHandoff.decision;
        mutableLane.latestActivity = `Reviewer is evaluating implementation commit ${reviewCommit}.`;
        mutableLane.updatedAt = now;
        appendLaneEvent(
          mutableLane,
          "coder",
          `Coder requested review for commit ${reviewCommit}: ${coderHandoff.summary}`,
          now,
        );
        appendLaneEvent(mutableLane, "reviewer", mutableLane.latestActivity, now);
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });

    const reviewerLane: TeamWorkerLaneRecord = {
      ...lane,
      status: "reviewing",
      latestImplementationCommit: branchHeadAfterCoding,
      pushedCommit: null,
      latestCoderHandoff: coderHandoff,
      latestCoderSummary: coderHandoff.summary,
      latestDecision: coderHandoff.decision,
    };

    const reviewerRole = await loadRolePrompt("reviewer");
    const reviewerState = buildLaneInitialState({
      repository: assignment.repository,
      lane: reviewerLane,
      assignment,
      workflow: getLaneWorkflow(),
      handoffs: {
        ...buildLanePersistedHandoffs({
          lane: reviewerLane,
          assignmentNumber,
        }),
        coder: coderHandoff,
      },
    });
    const reviewerResponse = await dependencies.reviewerRole(
      {
        role: reviewerRole,
        state: reviewerState,
        input:
          lane.taskObjective ??
          lane.taskTitle ??
          assignment.plannerSummary ??
          "Review the lane output.",
        onEvent: async (event) => {
          await appendTeamCodexLogEvent({
            threadFile: teamConfig.storage.threadFile,
            threadId,
            assignmentNumber,
            roleId: reviewerRole.id,
            laneId,
            event,
          });
        },
      },
      dependencies.executor,
    );
    const reviewerHandoff = applyHandoff({
      state: reviewerState,
      role: reviewerRole,
      summary: reviewerResponse.summary,
      deliverable: reviewerResponse.deliverable,
      decision: reviewerResponse.decision,
    });
    reviewerState.pullRequestDraft =
      reviewerResponse.pullRequestTitle && reviewerResponse.pullRequestSummary
        ? {
            title: reviewerResponse.pullRequestTitle,
            summary: reviewerResponse.pullRequestSummary,
          }
        : null;

    if (reviewerHandoff.decision === "needs_revision") {
      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (mutableThread, now) => {
          const mutableAssignment = findAssignment(
            mutableThread.dispatchAssignments,
            assignmentNumber,
          );
          const mutableLane = findLane(mutableAssignment, laneId);
          mutableLane.status = "queued";
          mutableLane.pushedCommit = null;
          mutableLane.latestDecision = reviewerHandoff.decision;
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestReviewerHandoff = reviewerHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
          mutableLane.latestReviewerSummary = reviewerHandoff.summary;
          mutableLane.latestActivity =
            "Reviewer requested changes and returned the proposal to the coding-review queue.";
          mutableLane.runCount += 1;
          mutableLane.revisionCount += 1;
          mutableLane.queuedAt = now;
          mutableLane.requeueReason = "reviewer_requested_changes";
          mutableLane.updatedAt = now;
          mutableLane.finishedAt = null;
          appendLaneEvent(
            mutableLane,
            "reviewer",
            `Reviewer requested changes: ${reviewerHandoff.summary}`,
            now,
          );
          synchronizeDispatchAssignment(mutableAssignment, now);
        },
      });

      continue;
    }

    const now = new Date().toISOString();
    const pullRequest = createPullRequestRecord({
      threadId,
      assignmentNumber,
      lane,
      draft: reviewerState.pullRequestDraft ?? {
        title: `Lane ${lane.laneIndex}: ${lane.taskTitle ?? "Ready for review"}`,
        summary: reviewerHandoff.summary,
      },
      now,
    });

    const hasConflict = await detectBranchConflict({
      repositoryPath: assignment.repository.path,
      baseBranch: lane.baseBranch,
      branchName: lane.branchName,
    });

    let latestImplementationCommit = branchHeadAfterCoding;
    let rebaseErrorSummary: string | null = null;

    if (hasConflict) {
      const rebaseAttempt = await tryRebaseWorktreeBranch({
        worktreePath: lane.worktreePath,
        baseBranch: lane.baseBranch,
      });

      if (rebaseAttempt.applied) {
        latestImplementationCommit = await getBranchHead({
          repositoryPath: assignment.repository.path,
          branchName: lane.branchName,
        });
      } else {
        rebaseErrorSummary = rebaseAttempt.error
          ? summarizeGitFailure(rebaseAttempt.error)
          : "Git rebase failed.";
      }
    }

    if (hasConflict && rebaseErrorSummary) {
      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (mutableThread, mutableNow) => {
          const mutableAssignment = findAssignment(
            mutableThread.dispatchAssignments,
            assignmentNumber,
          );
          const mutableLane = findLane(mutableAssignment, laneId);
          mutableLane.status = "queued";
          mutableLane.pushedCommit = null;
          mutableLane.latestDecision = reviewerHandoff.decision;
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestReviewerHandoff = reviewerHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
          mutableLane.latestReviewerSummary = reviewerHandoff.summary;
          mutableLane.latestActivity =
            "Planner detected a pull request conflict, the auto-rebase attempt failed, and the lane was requeued.";
          mutableLane.runCount += 1;
          mutableLane.revisionCount += 1;
          mutableLane.queuedAt = mutableNow;
          mutableLane.requeueReason = "planner_detected_conflict";
          mutableLane.pullRequest = {
            ...pullRequest,
            status: "conflict",
            updatedAt: mutableNow,
            humanApprovalRequestedAt: null,
            humanApprovedAt: null,
            machineReviewedAt: null,
          };
          mutableLane.updatedAt = mutableNow;
          mutableLane.finishedAt = null;
          appendLaneEvent(
            mutableLane,
            "reviewer",
            `Reviewer approved the proposal, but the planner auto-rebase attempt failed after detecting a conflict: ${reviewerHandoff.summary}`,
            mutableNow,
          );
          appendPlannerNote(
            mutableAssignment,
            `Conflict detected for proposal ${mutableLane.laneIndex}; automatic rebase onto ${mutableLane.baseBranch ?? lane.baseBranch} failed (${rebaseErrorSummary}), so the coder was requeued before machine review could complete.`,
            mutableNow,
          );
          synchronizeDispatchAssignment(mutableAssignment, mutableNow);
        },
      });

      continue;
    }

    let pushedCommit: Awaited<ReturnType<typeof pushLaneBranch>> | null = null;
    try {
      pushedCommit = await pushLaneBranch({
        repositoryPath: assignment.repository.path,
        branchName: lane.branchName,
        commitHash: latestImplementationCommit,
      });
    } catch (error) {
      const pushErrorSummary = summarizeGitFailure(
        error instanceof Error ? error.message : "Git push failed.",
      );
      const pushErrorMessage = `GitHub push failed for ${lane.branchName}: ${pushErrorSummary}`;

      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (mutableThread, mutableNow) => {
          const mutableAssignment = findAssignment(
            mutableThread.dispatchAssignments,
            assignmentNumber,
          );
          const mutableLane = findLane(mutableAssignment, laneId);
          mutableLane.status = "failed";
          mutableLane.latestImplementationCommit = latestImplementationCommit;
          mutableLane.pushedCommit = null;
          mutableLane.latestDecision = reviewerHandoff.decision;
          mutableLane.latestCoderHandoff = coderHandoff;
          mutableLane.latestReviewerHandoff = reviewerHandoff;
          mutableLane.latestCoderSummary = coderHandoff.summary;
          mutableLane.latestReviewerSummary = reviewerHandoff.summary;
          mutableLane.latestActivity =
            "Machine review approved the proposal, but publishing the lane branch to GitHub failed.";
          mutableLane.runCount += 1;
          mutableLane.workerSlot = null;
          mutableLane.requeueReason = null;
          mutableLane.lastError = pushErrorMessage;
          mutableLane.pullRequest = {
            ...pullRequest,
            status: "failed",
            updatedAt: mutableNow,
            machineReviewedAt: mutableNow,
          };
          mutableLane.updatedAt = mutableNow;
          mutableLane.finishedAt = mutableNow;
          if (hasConflict) {
            appendLaneEvent(
              mutableLane,
              "planner",
              `Planner rebased the lane onto ${mutableLane.baseBranch ?? lane.baseBranch} before final approval.`,
              mutableNow,
            );
          }
          appendLaneEvent(
            mutableLane,
            "reviewer",
            `Reviewer completed machine review: ${reviewerHandoff.summary}`,
            mutableNow,
          );
          appendLaneEvent(mutableLane, "system", pushErrorMessage, mutableNow);
          appendPlannerNote(
            mutableAssignment,
            `Proposal ${mutableLane.laneIndex} passed machine review, but publishing ${mutableLane.branchName ?? lane.branchName} to GitHub failed (${pushErrorSummary}).`,
            mutableNow,
          );
          synchronizeDispatchAssignment(mutableAssignment, mutableNow);
        },
      });

      await appendTeamCodexLogEvent({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        assignmentNumber,
        roleId: null,
        laneId,
        event: {
          source: "system",
          message: pushErrorMessage,
          createdAt: new Date().toISOString(),
        },
      });

      return;
    }

    if (!pushedCommit) {
      return;
    }

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, mutableNow) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        mutableLane.status = "approved";
        mutableLane.latestImplementationCommit = latestImplementationCommit;
        mutableLane.pushedCommit = pushedCommit;
        mutableLane.latestDecision = reviewerHandoff.decision;
        mutableLane.latestCoderHandoff = coderHandoff;
        mutableLane.latestReviewerHandoff = reviewerHandoff;
        mutableLane.latestCoderSummary = coderHandoff.summary;
        mutableLane.latestReviewerSummary = reviewerHandoff.summary;
        mutableLane.latestActivity =
          "Reviewer completed machine review. Human approval can now archive the OpenSpec change and open or refresh the GitHub PR.";
        mutableLane.runCount += 1;
        mutableLane.workerSlot = null;
        mutableLane.requeueReason = null;
        mutableLane.pullRequest = {
          ...pullRequest,
          updatedAt: mutableNow,
          machineReviewedAt: mutableNow,
        };
        mutableLane.updatedAt = mutableNow;
        mutableLane.finishedAt = mutableNow;
        if (hasConflict) {
          appendLaneEvent(
            mutableLane,
            "planner",
            `Planner rebased the lane onto ${mutableLane.baseBranch ?? lane.baseBranch} before final approval.`,
            mutableNow,
          );
        }
        appendLaneEvent(
          mutableLane,
          "reviewer",
          `Reviewer completed machine review: ${reviewerHandoff.summary}`,
          mutableNow,
        );
        appendLaneEvent(
          mutableLane,
          "system",
          `Published commit ${shortenCommit(pushedCommit.commitHash)} to GitHub via ${pushedCommit.remoteName}.`,
          mutableNow,
        );
        appendLaneEvent(
          mutableLane,
          "system",
          "Machine review completed. Human approval can now archive the OpenSpec change and open or refresh the GitHub PR.",
          mutableNow,
        );
        appendPlannerNote(
          mutableAssignment,
          hasConflict
            ? `Proposal ${mutableLane.laneIndex} was automatically rebased onto ${mutableLane.baseBranch ?? lane.baseBranch}, pushed to GitHub, and passed machine review. It is now waiting for final human approval.`
            : `Proposal ${mutableLane.laneIndex} was pushed to GitHub, passed machine review, and is now waiting for final human approval.`,
          mutableNow,
        );
        synchronizeDispatchAssignment(mutableAssignment, mutableNow);
      },
    });

    return;
  }
};

const ensureLaneRun = ({
  threadId,
  assignmentNumber,
  laneId,
  dependencies,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  dependencies: TeamRoleDependencies;
}): void => {
  const key = laneRunKey(threadId, assignmentNumber, laneId);
  if (activeLaneRuns.has(key)) {
    return;
  }

  const runPromise = (async () => {
    try {
      await runLaneCycle({
        threadId,
        assignmentNumber,
        laneId,
        dependencies,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Background lane execution failed.";
      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (thread, now) => {
          const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
          const lane = findLane(assignment, laneId);
          lane.status = "failed";
          lane.workerSlot = null;
          lane.lastError = message;
          lane.latestActivity = "Background lane execution failed.";
          lane.updatedAt = now;
          lane.finishedAt = now;
          appendLaneEvent(lane, "system", message, now);
          appendPlannerNote(
            assignment,
            `Lane ${lane.laneIndex} failed and needs attention: ${message}`,
            now,
          );
          synchronizeDispatchAssignment(assignment, now);
        },
      });
      await appendTeamCodexLogEvent({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        assignmentNumber,
        roleId: null,
        laneId,
        event: {
          source: "system",
          message,
          createdAt: new Date().toISOString(),
        },
      });
    } finally {
      activeLaneRuns.delete(key);
      void ensurePendingDispatchWork({ threadId, dependencies });
    }
  })();

  activeLaneRuns.set(key, runPromise);
};

const prioritizeThreadIds = (threadIds: string[], prioritizedThreadId?: string): string[] => {
  if (!prioritizedThreadId) {
    return threadIds;
  }

  return [...threadIds].sort((left, right) => {
    const leftPriority = left === prioritizedThreadId ? 0 : 1;
    const rightPriority = right === prioritizedThreadId ? 0 : 1;
    return leftPriority - rightPriority || left.localeCompare(right);
  });
};

export const ensurePendingDispatchWork = async ({
  threadId,
  dependencies,
}: {
  threadId?: string;
  dependencies?: Partial<TeamRoleDependencies>;
} = {}): Promise<void> => {
  const resolvedDependencies = resolveTeamRoleDependencies(dependencies);
  const pendingAssignments = await listPendingDispatchAssignments(teamConfig.storage.threadFile);
  const expectedLaneStateByKey = new Map<string, LanePoolSchedulingState>();
  for (const pending of pendingAssignments) {
    for (const lane of pending.assignment.lanes) {
      expectedLaneStateByKey.set(
        buildLanePoolStateKey({
          threadId: pending.threadId,
          assignmentNumber: pending.assignment.assignmentNumber,
          laneId: lane.laneId,
        }),
        captureLanePoolSchedulingState(lane),
      );
    }
  }

  assignPendingDispatchWorkerSlots({
    pendingAssignments,
    workerCount: teamConfig.dispatch.workerCount,
    resolveAssignmentWorktreeRoot: (pending) =>
      resolveWorktreeRoot({
        repositoryPath: pending.assignment.repository?.path ?? "",
        worktreeRoot: teamConfig.dispatch.worktreeRoot,
      }),
  });

  const plannedLaneStateByKey = new Map<string, PlannedLanePoolState>();
  const pendingAssignmentsByThread = new Map<string, PendingDispatchAssignment[]>();
  for (const pending of pendingAssignments) {
    for (const lane of pending.assignment.lanes) {
      const lanePoolStateKey = buildLanePoolStateKey({
        threadId: pending.threadId,
        assignmentNumber: pending.assignment.assignmentNumber,
        laneId: lane.laneId,
      });
      const expectedLaneState = expectedLaneStateByKey.get(lanePoolStateKey);
      if (!expectedLaneState) {
        continue;
      }

      plannedLaneStateByKey.set(lanePoolStateKey, {
        expected: expectedLaneState,
        planned: {
          workerSlot: lane.workerSlot,
          worktreePath: lane.worktreePath,
        },
      });
    }

    const pendingForThread = pendingAssignmentsByThread.get(pending.threadId) ?? [];
    pendingForThread.push(pending);
    pendingAssignmentsByThread.set(pending.threadId, pendingForThread);
  }

  for (const currentThreadId of prioritizeThreadIds(
    [...pendingAssignmentsByThread.keys()],
    threadId,
  )) {
    const pendingForThread = pendingAssignmentsByThread.get(currentThreadId);
    if (!pendingForThread) {
      continue;
    }

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId: currentThreadId,
      updater: (thread, now) => {
        for (const pending of pendingForThread) {
          const assignment = findAssignment(
            thread.dispatchAssignments,
            pending.assignment.assignmentNumber,
          );

          for (const lane of assignment.lanes) {
            const plannedLaneState = plannedLaneStateByKey.get(
              buildLanePoolStateKey({
                threadId: currentThreadId,
                assignmentNumber: assignment.assignmentNumber,
                laneId: lane.laneId,
              }),
            );
            if (!plannedLaneState) {
              continue;
            }

            // Ignore stale allocator passes that would clobber fresher slot updates.
            if (!lanePoolSchedulingStateMatches(lane, plannedLaneState.expected)) {
              continue;
            }

            lane.workerSlot = plannedLaneState.planned.workerSlot;
            lane.worktreePath = plannedLaneState.planned.worktreePath;
          }

          synchronizeDispatchAssignment(assignment, now);
        }
      },
    });
  }

  const refreshedAssignments = await listPendingDispatchAssignments(teamConfig.storage.threadFile);

  for (const pending of refreshedAssignments) {
    for (const lane of pending.assignment.lanes) {
      if (
        (lane.status === "queued" || lane.status === "coding" || lane.status === "reviewing") &&
        lane.workerSlot
      ) {
        ensureLaneRun({
          threadId: pending.threadId,
          assignmentNumber: pending.assignment.assignmentNumber,
          laneId: lane.laneId,
          dependencies: resolvedDependencies,
        });
      }
    }
  }
};

export const approveLaneProposal = async ({
  threadId,
  assignmentNumber,
  laneId,
  dependencies,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
  dependencies?: Partial<TeamRoleDependencies>;
}): Promise<void> => {
  await updateTeamThreadRecord({
    threadFile: teamConfig.storage.threadFile,
    threadId,
    updater: (thread, now) => {
      const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
      const lane = findLane(assignment, laneId);
      if (lane.status !== "awaiting_human_approval") {
        throw new Error("This proposal is not waiting for human approval.");
      }

      lane.status = "queued";
      lane.latestActivity = "Human approved the proposal and added it to the coding-review queue.";
      lane.approvalGrantedAt = now;
      lane.workerSlot = null;
      lane.worktreePath = null;
      lane.queuedAt = now;
      lane.updatedAt = now;
      lane.finishedAt = null;
      appendLaneEvent(
        lane,
        "human",
        "Human approved the proposal and sent it to the coding-review queue.",
        now,
      );
      appendPlannerNote(
        assignment,
        `Human approved proposal ${lane.laneIndex}; coding and machine review were queued.`,
        now,
      );
      synchronizeDispatchAssignment(assignment, now);
    },
  });

  void ensurePendingDispatchWork({ threadId, dependencies });
};

export const approveLanePullRequest = async ({
  threadId,
  assignmentNumber,
  laneId,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
}): Promise<void> => {
  const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
  if (!thread) {
    throw new Error(`Thread ${threadId} was not found in ${teamConfig.storage.threadFile}.`);
  }

  const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
  const lane = findLane(assignment, laneId);
  const pullRequest = lane.pullRequest;

  if (lane.status !== "approved" || !pullRequest) {
    throw new Error("This reviewed branch is not waiting for final human approval.");
  }

  if (pullRequest.status === "approved") {
    throw new Error("This reviewed branch is already finalized.");
  }

  if (pullRequest.status === "awaiting_human_approval" && pullRequest.humanApprovedAt) {
    throw new Error("Final approval is already being processed for this reviewed branch.");
  }

  if (pullRequest.status !== "awaiting_human_approval" && pullRequest.status !== "failed") {
    throw new Error(
      "This reviewed branch cannot be finalized from its current pull request state.",
    );
  }

  if (!assignment.repository) {
    throw new Error("Finalizing a reviewed branch requires a repository.");
  }

  if (!lane.branchName || !lane.baseBranch || !lane.proposalChangeName) {
    throw new Error(
      "This reviewed branch is missing the branch or OpenSpec metadata required for final approval.",
    );
  }

  const pullRequestTitle =
    pullRequest.title.trim() || `Lane ${lane.laneIndex}: ${lane.taskTitle ?? "Ready for review"}`;
  const pullRequestSummary =
    pullRequest.summary?.trim() ||
    lane.latestReviewerSummary?.trim() ||
    `Proposal ${lane.laneIndex} passed machine review.`;
  const finalizationWorktreePath = buildLaneFinalizationWorktreePath({
    repositoryPath: assignment.repository.path,
    threadId,
    assignmentNumber,
    laneId,
  });

  const humanApprovedAt = await updateTeamThreadRecord({
    threadFile: teamConfig.storage.threadFile,
    threadId,
    updater: (mutableThread, now) => {
      const mutableAssignment = findAssignment(mutableThread.dispatchAssignments, assignmentNumber);
      const mutableLane = findLane(mutableAssignment, laneId);
      const mutablePullRequest = mutableLane.pullRequest;

      if (mutableLane.status !== "approved" || !mutablePullRequest) {
        throw new Error("This reviewed branch is not waiting for final human approval.");
      }

      if (mutablePullRequest.status === "approved") {
        throw new Error("This reviewed branch is already finalized.");
      }

      if (
        mutablePullRequest.status === "awaiting_human_approval" &&
        mutablePullRequest.humanApprovedAt
      ) {
        throw new Error("Final approval is already being processed for this reviewed branch.");
      }

      if (
        mutablePullRequest.status !== "awaiting_human_approval" &&
        mutablePullRequest.status !== "failed"
      ) {
        throw new Error(
          "This reviewed branch cannot be finalized from its current pull request state.",
        );
      }

      const nextHumanApprovedAt = mutablePullRequest.humanApprovedAt ?? now;
      const isRetry = mutablePullRequest.status === "failed";

      mutableLane.latestActivity = isRetry
        ? "Retrying final approval to archive the OpenSpec change and refresh the GitHub PR."
        : "Human approved the machine-reviewed branch. Archiving the OpenSpec change and refreshing the GitHub PR.";
      mutableLane.lastError = null;
      mutableLane.pullRequest = {
        ...mutablePullRequest,
        status: "awaiting_human_approval",
        humanApprovedAt: nextHumanApprovedAt,
        updatedAt: now,
      };
      mutableLane.updatedAt = now;
      appendLaneEvent(
        mutableLane,
        "human",
        isRetry
          ? "Human retried final approval for the machine-reviewed branch."
          : "Human approved the machine-reviewed branch for GitHub PR delivery.",
        now,
      );
      synchronizeDispatchAssignment(mutableAssignment, now);

      return nextHumanApprovedAt;
    },
  });

  let latestImplementationCommit = lane.latestImplementationCommit;
  let updatedPushedCommit = lane.pushedCommit;
  let archivedProposalPath = lane.proposalPath;
  let archiveCreated = false;
  let archivePersistedToBranch =
    lane.proposalPath?.startsWith("openspec/changes/archive/") ?? false;

  try {
    await ensureLaneWorktree({
      repositoryPath: assignment.repository.path,
      worktreePath: finalizationWorktreePath,
      branchName: lane.branchName,
      startPoint: lane.latestImplementationCommit ?? lane.baseBranch,
    });

    const archiveResult = await archiveOpenSpecChangeInWorktree({
      worktreePath: finalizationWorktreePath,
      changeName: lane.proposalChangeName,
    });
    archivedProposalPath = archiveResult.archivedPath;
    archiveCreated = archiveResult.createdArchive;

    if (archiveResult.createdArchive) {
      await commitWorktreeChanges({
        worktreePath: finalizationWorktreePath,
        message: `system: archive ${lane.proposalChangeName}`,
      });
    }
    archivePersistedToBranch = true;

    latestImplementationCommit = await getBranchHead({
      repositoryPath: assignment.repository.path,
      branchName: lane.branchName,
    });
    updatedPushedCommit = await pushLaneBranch({
      repositoryPath: assignment.repository.path,
      branchName: lane.branchName,
      commitHash: latestImplementationCommit,
    });

    if (!latestImplementationCommit || !updatedPushedCommit) {
      throw new Error(
        "Final approval could not resolve the archived branch head for GitHub delivery.",
      );
    }

    const finalizedCommitHash = latestImplementationCommit;
    const finalizedPushedCommit = updatedPushedCommit;

    const gitHubPullRequest = await createOrUpdateGitHubPullRequest({
      repositoryPath: finalizationWorktreePath,
      branchName: lane.branchName,
      baseBranch: lane.baseBranch,
      title: pullRequestTitle,
      body: pullRequestSummary,
    });

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        const mutablePullRequest = mutableLane.pullRequest;

        if (!mutablePullRequest) {
          throw new Error("This reviewed branch no longer has pull request metadata.");
        }

        mutableLane.proposalPath = archivedProposalPath;
        mutableLane.latestImplementationCommit = finalizedCommitHash;
        mutableLane.pushedCommit = finalizedPushedCommit;
        mutableLane.latestActivity =
          "Human approval finalized the machine-reviewed branch. The OpenSpec change was archived and the GitHub PR is ready.";
        mutableLane.lastError = null;
        mutableLane.pullRequest = {
          ...mutablePullRequest,
          provider: "github",
          title: pullRequestTitle,
          summary: pullRequestSummary,
          status: "approved",
          humanApprovedAt,
          updatedAt: now,
          url: gitHubPullRequest.url,
        };
        mutableLane.updatedAt = now;
        appendLaneEvent(
          mutableLane,
          "system",
          archiveCreated
            ? `Archived OpenSpec change to ${archivedProposalPath} and pushed commit ${shortenCommit(finalizedCommitHash)} to GitHub via ${finalizedPushedCommit.remoteName}.`
            : `Verified archived OpenSpec change at ${archivedProposalPath} and refreshed commit ${shortenCommit(finalizedCommitHash)} on GitHub via ${finalizedPushedCommit.remoteName}.`,
          now,
        );
        appendLaneEvent(mutableLane, "system", `GitHub PR ready: ${gitHubPullRequest.url}`, now);
        appendPlannerNote(
          mutableAssignment,
          `Human approved proposal ${mutableLane.laneIndex}; ${archivedProposalPath} is archived on ${mutableLane.branchName ?? lane.branchName}, and the GitHub PR is ready at ${gitHubPullRequest.url}.`,
          now,
        );
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });
  } catch (error) {
    const errorSummary = summarizeGitFailure(
      error instanceof Error ? error.message : "GitHub PR finalization failed.",
    );

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(
          mutableThread.dispatchAssignments,
          assignmentNumber,
        );
        const mutableLane = findLane(mutableAssignment, laneId);
        const mutablePullRequest = mutableLane.pullRequest;

        if (!mutablePullRequest) {
          throw new Error("This reviewed branch no longer has pull request metadata.");
        }

        if (archivePersistedToBranch) {
          mutableLane.proposalPath = archivedProposalPath;
        }
        mutableLane.latestImplementationCommit = latestImplementationCommit;
        mutableLane.pushedCommit = updatedPushedCommit;
        mutableLane.latestActivity = archivePersistedToBranch
          ? "Final human approval archived the OpenSpec change, but GitHub PR delivery did not complete."
          : "Final human approval failed before the OpenSpec archive and GitHub PR delivery could complete.";
        mutableLane.lastError = errorSummary;
        mutableLane.pullRequest = {
          ...mutablePullRequest,
          title: pullRequestTitle,
          summary: pullRequestSummary,
          status: "failed",
          humanApprovedAt,
          updatedAt: now,
        };
        mutableLane.updatedAt = now;
        appendLaneEvent(mutableLane, "system", errorSummary, now);
        appendPlannerNote(
          mutableAssignment,
          archivePersistedToBranch &&
            archivedProposalPath &&
            archivedProposalPath !== lane.proposalPath
            ? `Final approval for proposal ${mutableLane.laneIndex} failed after archiving ${archivedProposalPath}: ${errorSummary}`
            : `Final approval for proposal ${mutableLane.laneIndex} failed: ${errorSummary}`,
          now,
        );
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });

    await appendTeamCodexLogEvent({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      assignmentNumber,
      roleId: null,
      laneId,
      event: {
        source: "system",
        message: errorSummary,
        createdAt: new Date().toISOString(),
      },
    });

    throw error;
  }
};

const buildProposalSnapshot = (assignment: TeamDispatchAssignment): string => {
  return assignment.lanes
    .filter((lane) => lane.taskTitle || lane.taskObjective)
    .map((lane) => {
      return [
        `Proposal ${lane.laneIndex}: ${lane.taskTitle ?? "Untitled proposal"}`,
        `Objective: ${lane.taskObjective ?? "No objective recorded."}`,
        `Status: ${lane.status}`,
        lane.latestCoderSummary ? `Latest coding summary: ${lane.latestCoderSummary}` : null,
        lane.latestReviewerSummary ? `Latest machine review: ${lane.latestReviewerSummary}` : null,
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
  repositoryId: string | undefined;
}> => {
  const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
  if (!thread) {
    throw new Error(`Thread ${threadId} was not found.`);
  }

  const assignment = findAssignment(thread.dispatchAssignments, assignmentNumber);
  if (assignment.supersededAt) {
    throw new Error("This request group has already been superseded by newer feedback.");
  }

  const hasActiveQueue = assignment.lanes.some(
    (lane) => lane.status === "queued" || lane.status === "coding" || lane.status === "reviewing",
  );
  if (hasActiveQueue) {
    throw new Error(
      "Wait for the active coding-review queue to finish before restarting planning with human feedback.",
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
    repositoryId: thread.data.selectedRepository?.id,
  };
};
