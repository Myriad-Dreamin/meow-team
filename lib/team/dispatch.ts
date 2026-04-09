import "server-only";

import { createAgent, createNetwork, createState, createTool } from "@inngest/agent-kit";
import { z } from "zod";
import { teamConfig } from "@/team.config";
import { createSaveHandoffTool, summarizeHandoffs, type TeamRoleState } from "@/lib/team/agent-helpers";
import {
  buildCanonicalBranchName,
  buildLaneBranchName,
  buildLaneWorktreePath,
  detectBranchConflict,
  ensureLaneWorktree,
  resolveRepositoryBaseBranch,
  resolveWorktreeRoot,
} from "@/lib/team/git";
import {
  getTeamThreadRecord,
  listPendingDispatchAssignments,
  synchronizeDispatchAssignment,
  updateTeamThreadRecord,
} from "@/lib/team/history";
import { createTeamModel, ensureOpenAiApiKey } from "@/lib/team/model";
import {
  buildProposalChangeName,
  buildProposalPath,
  materializeAssignmentProposals,
} from "@/lib/team/openspec";
import { loadRolePrompt, type RolePrompt } from "@/lib/team/prompts";
import type { TeamRepositoryOption } from "@/lib/team/repository-types";
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
  conflictNote: string | null;
  pullRequestDraft: LanePullRequestDraft | null;
};

const activeLaneRuns = new Map<string, Promise<void>>();

const laneRunKey = (threadId: string, assignmentNumber: number, laneId: string): string => {
  return `${threadId}:${assignmentNumber}:${laneId}`;
};

const createLaneEvent = (
  actor: TeamWorkerEventActor,
  message: string,
  createdAt: string,
) => {
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

const appendPlannerNote = (assignment: TeamDispatchAssignment, message: string, now: string): void => {
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
    taskObjective: lane.taskObjective ?? assignment.plannerSummary ?? "Implement the assigned task.",
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
    conflictNote:
      lane.requeueReason === "planner_detected_conflict"
        ? "Planner detected a pull request conflict. Resolve the branch and prepare it for review again."
        : null,
    workflow,
    handoffs,
    handoffCounter: Object.keys(handoffs).length,
    assignmentNumber: assignment.assignmentNumber,
    pullRequestDraft: null,
  };
};

const createLaneSystemPrompt = (role: RolePrompt) => {
  return async ({ network }: { network?: { state: { data: LaneRunState } } }) => {
    const state = network?.state.data;
    if (!state) {
      return role.prompt.trim();
    }

    return [
      `You are ${role.name}, a background lane role inside the ${state.teamName} engineering harness.`,
      `Owner: ${state.ownerName}.`,
      `Shared objective: ${state.objective}`,
      `Repository: ${state.repository.name} at ${state.repository.path}.`,
      `Dedicated branch: ${state.branchName}.`,
      `Base branch: ${state.baseBranch}.`,
      `Dedicated worktree: ${state.worktreePath}.`,
      `Lane index: ${state.laneIndex}.`,
      `Task title: ${state.taskTitle}.`,
      `Task objective: ${state.taskObjective}`,
      `Planner summary: ${state.planSummary}`,
      `Planner deliverable: ${state.planDeliverable}`,
      state.conflictNote ? `Planner note: ${state.conflictNote}` : null,
      `Workflow context: ${state.workflow.join(" -> ")}`,
      `Current handoffs:`,
      summarizeHandoffs(state),
      `Your role prompt is below:`,
      role.prompt.trim(),
      `Rules:`,
      `- Operate only on this lane's branch and worktree.`,
      `- Always call save_handoff exactly once before finishing.`,
      role.id === "reviewer"
        ? `- If the branch is ready, call publish_pull_request before save_handoff and set decision to approved to mark machine review complete.`
        : `- As coder, always set decision to continue and hand off cleanly to the reviewer.`,
    ]
      .filter(Boolean)
      .join("\n\n");
  };
};

const createPublishPullRequestTool = () => {
  return createTool({
    name: "publish_pull_request",
    description:
      "Create or refresh the lane's CI pull request once the approved proposal is ready to finish machine review.",
    parameters: z.object({
      title: z.string().trim().min(1),
      summary: z.string().trim().min(1),
    }),
    handler: async ({ title, summary }, { network }) => {
      const state = network.state.data as LaneRunState;
      state.pullRequestDraft = {
        title,
        summary,
      };

      return {
        ok: true,
        branchName: state.branchName,
        baseBranch: state.baseBranch,
      };
    },
  });
};

const runRoleNetwork = async ({
  role,
  state,
  input,
  tools = [],
}: {
  role: RolePrompt;
  state: LaneRunState;
  input: string;
  tools?: ReturnType<typeof createTool>[];
}): Promise<LaneRunState> => {
  ensureOpenAiApiKey();
  const teamModel = createTeamModel();
  const agent = createAgent<LaneRunState>({
    name: role.id,
    description: role.summary,
    system: createLaneSystemPrompt(role),
    tools: [createSaveHandoffTool<LaneRunState>(role), ...tools],
    model: teamModel,
  });

  const network = createNetwork<LaneRunState>({
    name: `${teamConfig.name} ${role.id} lane`,
    description: `Single-role execution for ${role.id} in a background lane.`,
    agents: [agent],
    defaultModel: teamModel,
    maxIter: 2,
    router: async ({ network: currentNetwork }) => {
      return currentNetwork.state.results.length === 0 ? currentNetwork.agents.get(role.id) : undefined;
    },
  });

  const run = await network.run(input, {
    state: createState(state),
  });

  return run.state.data;
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
    branchName: lane.branchName ?? `lane-${lane.laneIndex}`,
    baseBranch: lane.baseBranch ?? teamConfig.dispatch.baseBranch,
    status: "approved",
    requestedAt: now,
    humanApprovalRequestedAt: null,
    humanApprovedAt: null,
    machineReviewedAt: now,
    updatedAt: now,
    url: null,
  };
};

const createProposalLane = ({
  laneIndex,
  task,
  branchPrefix,
  assignmentNumber,
  baseBranch,
  worktreeRoot,
}: {
  laneIndex: number;
  task?: DispatchTask;
  branchPrefix: string;
  assignmentNumber: number;
  baseBranch: string;
  worktreeRoot: string;
}): TeamWorkerLaneRecord => {
  const laneId = `lane-${laneIndex}`;
  const now = new Date().toISOString();

  if (!task) {
    return {
      laneId,
      laneIndex,
      status: "idle",
      taskTitle: null,
      taskObjective: null,
      proposalChangeName: null,
      proposalPath: null,
      branchName: null,
      baseBranch: null,
      worktreePath: null,
      latestDecision: null,
      latestCoderSummary: null,
      latestReviewerSummary: null,
      latestActivity: "Idle and waiting for planner work.",
      approvalRequestedAt: null,
      approvalGrantedAt: null,
      queuedAt: null,
      runCount: 0,
      revisionCount: 0,
      requeueReason: null,
      lastError: null,
      pullRequest: null,
      events: [],
      startedAt: null,
      finishedAt: null,
      updatedAt: now,
    };
  }

  const branchName = buildLaneBranchName({
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
    branchName,
    baseBranch,
    worktreePath: buildLaneWorktreePath({
      worktreeRoot,
      laneIndex,
    }),
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
  plannerSummary,
  plannerDeliverable,
  branchPrefix,
  tasks,
}: {
  threadId: string;
  assignmentNumber: number;
  repository: TeamRepositoryOption | null;
  plannerSummary: string;
  plannerDeliverable: string;
  branchPrefix: string;
  tasks: DispatchTask[];
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
    branchPrefix,
    assignmentNumber,
  });
  const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);

  const assignment: TeamDispatchAssignment = synchronizeDispatchAssignment(
    {
      assignmentNumber,
      status: "planning",
      repository,
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
      lanes: Array.from({ length: teamConfig.dispatch.workerCount }, (_, index) =>
        createProposalLane({
          laneIndex: index + 1,
          task: tasks[index],
          branchPrefix,
          assignmentNumber,
          baseBranch: resolvedBaseBranch,
          worktreeRoot: resolvedWorktreeRoot,
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

  await materializeAssignmentProposals({
    repositoryPath: repository.path,
    baseBranch: resolvedBaseBranch,
    canonicalBranchName,
    plannerSummary,
    plannerDeliverable,
    requestInput: thread?.data.latestInput ?? thread?.userMessages[0]?.content ?? null,
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

const runLaneCycle = async ({
  threadId,
  assignmentNumber,
  laneId,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
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

    if (!assignment.repository || !lane.worktreePath || !lane.branchName || !lane.baseBranch) {
      throw new Error("Lane is missing repository, branch, or worktree metadata.");
    }

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(mutableThread.dispatchAssignments, assignmentNumber);
        const mutableLane = findLane(mutableAssignment, laneId);
        mutableLane.status = "coding";
        mutableLane.lastError = null;
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

    const coderRole = await loadRolePrompt("coder");
    const reviewerRole = await loadRolePrompt("reviewer");
    const coderState = await runRoleNetwork({
      role: coderRole,
      state: buildLaneInitialState({
        repository: assignment.repository,
        lane,
        assignment,
        workflow: ["coder"],
        handoffs: {},
      }),
      input: lane.taskObjective ?? lane.taskTitle ?? assignment.plannerSummary ?? "Implement the task.",
    });

    const coderHandoff = coderState.handoffs.coder;
    if (!coderHandoff) {
      throw new Error(`Coder lane ${lane.laneIndex} completed without saving a handoff.`);
    }

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, now) => {
        const mutableAssignment = findAssignment(mutableThread.dispatchAssignments, assignmentNumber);
        const mutableLane = findLane(mutableAssignment, laneId);
        mutableLane.status = "reviewing";
        mutableLane.latestCoderSummary = coderHandoff.summary;
        mutableLane.latestDecision = coderHandoff.decision;
        mutableLane.latestActivity = "Reviewer is evaluating the branch output.";
        mutableLane.updatedAt = now;
        appendLaneEvent(
          mutableLane,
          "coder",
          `Coder handoff: ${coderHandoff.summary}`,
          now,
        );
        appendLaneEvent(mutableLane, "reviewer", mutableLane.latestActivity, now);
        synchronizeDispatchAssignment(mutableAssignment, now);
      },
    });

    const reviewerState = await runRoleNetwork({
      role: reviewerRole,
      state: buildLaneInitialState({
        repository: assignment.repository,
        lane,
        assignment,
        workflow: ["coder", "reviewer"],
        handoffs: {
          coder: coderHandoff,
        },
      }),
      input: lane.taskObjective ?? lane.taskTitle ?? assignment.plannerSummary ?? "Review the lane output.",
      tools: [createPublishPullRequestTool()],
    });

    const reviewerHandoff = reviewerState.handoffs.reviewer;
    if (!reviewerHandoff) {
      throw new Error(`Reviewer lane ${lane.laneIndex} completed without saving a handoff.`);
    }

    if (reviewerHandoff.decision === "needs_revision") {
      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (mutableThread, now) => {
          const mutableAssignment = findAssignment(mutableThread.dispatchAssignments, assignmentNumber);
          const mutableLane = findLane(mutableAssignment, laneId);
          mutableLane.status = "queued";
          mutableLane.latestDecision = reviewerHandoff.decision;
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

    if (hasConflict) {
      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId,
        updater: (mutableThread, mutableNow) => {
          const mutableAssignment = findAssignment(mutableThread.dispatchAssignments, assignmentNumber);
          const mutableLane = findLane(mutableAssignment, laneId);
          mutableLane.status = "queued";
          mutableLane.latestDecision = reviewerHandoff.decision;
          mutableLane.latestCoderSummary = coderHandoff.summary;
          mutableLane.latestReviewerSummary = reviewerHandoff.summary;
          mutableLane.latestActivity = "Planner detected a pull request conflict and requeued the lane.";
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
            `Reviewer approved the proposal, but the planner detected a conflict: ${reviewerHandoff.summary}`,
            mutableNow,
          );
          appendPlannerNote(
            mutableAssignment,
            `Conflict detected for proposal ${mutableLane.laneIndex}; the coder was requeued before machine review could complete.`,
            mutableNow,
          );
          synchronizeDispatchAssignment(mutableAssignment, mutableNow);
        },
      });

      continue;
    }

    await updateTeamThreadRecord({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      updater: (mutableThread, mutableNow) => {
        const mutableAssignment = findAssignment(mutableThread.dispatchAssignments, assignmentNumber);
        const mutableLane = findLane(mutableAssignment, laneId);
        mutableLane.status = "approved";
        mutableLane.latestDecision = reviewerHandoff.decision;
        mutableLane.latestCoderSummary = coderHandoff.summary;
        mutableLane.latestReviewerSummary = reviewerHandoff.summary;
        mutableLane.latestActivity = "Reviewer completed machine review for the approved proposal.";
        mutableLane.runCount += 1;
        mutableLane.requeueReason = null;
        mutableLane.pullRequest = {
          ...pullRequest,
          updatedAt: mutableNow,
          machineReviewedAt: mutableNow,
        };
        mutableLane.updatedAt = mutableNow;
        mutableLane.finishedAt = mutableNow;
        appendLaneEvent(
          mutableLane,
          "reviewer",
          `Reviewer completed machine review: ${reviewerHandoff.summary}`,
          mutableNow,
        );
        appendLaneEvent(
          mutableLane,
          "system",
          "Machine review completed. Human feedback can now refine this proposal or the full request group.",
          mutableNow,
        );
        appendPlannerNote(
          mutableAssignment,
          `Proposal ${mutableLane.laneIndex} completed coding and machine review.`,
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
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
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
    } finally {
      activeLaneRuns.delete(key);
    }
  })();

  activeLaneRuns.set(key, runPromise);
};

export const ensurePendingDispatchWork = async ({
  threadId,
}: {
  threadId?: string;
} = {}): Promise<void> => {
  const pendingAssignments = await listPendingDispatchAssignments(
    teamConfig.storage.threadFile,
    threadId,
  );

  for (const pending of pendingAssignments) {
    for (const lane of pending.assignment.lanes) {
      if (lane.status === "queued" || lane.status === "coding" || lane.status === "reviewing") {
        ensureLaneRun({
          threadId: pending.threadId,
          assignmentNumber: pending.assignment.assignmentNumber,
          laneId: lane.laneId,
        });
      }
    }
  }
};

export const approveLaneProposal = async ({
  threadId,
  assignmentNumber,
  laneId,
}: {
  threadId: string;
  assignmentNumber: number;
  laneId: string;
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

  void ensurePendingDispatchWork({ threadId });
};

export const approveLanePullRequest = approveLaneProposal;

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
  const originalRequest = thread.userMessages[0]?.content ?? thread.data.latestInput;
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
    repositoryId: thread.data.selectedRepository?.id,
  };
};
