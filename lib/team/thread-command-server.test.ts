import { describe, expect, it, vi } from "vitest";
import {
  executeThreadCommandForThread,
  type ThreadCommandExecutors,
} from "@/lib/team/thread-command-server";
import { parseThreadCommand } from "@/lib/team/thread-command";
import type { TeamThreadRecord } from "@/lib/team/history";
import type {
  TeamDispatchAssignment,
  TeamPullRequestRecord,
  TeamWorkerLaneRecord,
} from "@/lib/team/types";

const FIXED_TIMESTAMP = "2026-04-18T08:00:00.000Z";

const createPullRequest = (
  overrides: Partial<TeamPullRequestRecord> = {},
): TeamPullRequestRecord => {
  return {
    id: "pr-1",
    provider: "github",
    title: "Proposal 1",
    summary: "Machine review approved the branch.",
    branchName: "requests/thread-command/a1-proposal-1",
    baseBranch: "main",
    status: "awaiting_human_approval",
    requestedAt: FIXED_TIMESTAMP,
    humanApprovalRequestedAt: FIXED_TIMESTAMP,
    humanApprovedAt: null,
    machineReviewedAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    url: "https://github.com/example/meow-team/pull/1",
    ...overrides,
  };
};

const createLane = (overrides: Partial<TeamWorkerLaneRecord> = {}): TeamWorkerLaneRecord => {
  return {
    laneId: "lane-1",
    laneIndex: 1,
    status: "awaiting_human_approval",
    executionPhase: null,
    taskTitle: "Proposal 1",
    taskObjective: "Implement proposal 1.",
    proposalChangeName: "change-1",
    proposalPath: "openspec/changes/change-1",
    workerSlot: null,
    branchName: "requests/thread-command/a1-proposal-1",
    baseBranch: "main",
    worktreePath: "/tmp/meow-1",
    latestImplementationCommit: null,
    pushedCommit: null,
    latestCoderHandoff: null,
    latestReviewerHandoff: null,
    latestDecision: null,
    latestCoderSummary: null,
    latestReviewerSummary: null,
    latestActivity: null,
    approvalRequestedAt: FIXED_TIMESTAMP,
    approvalGrantedAt: null,
    queuedAt: null,
    runCount: 1,
    revisionCount: 0,
    requeueReason: null,
    lastError: null,
    pullRequest: null,
    events: [],
    startedAt: FIXED_TIMESTAMP,
    finishedAt: null,
    updatedAt: FIXED_TIMESTAMP,
    ...overrides,
  };
};

const createAssignment = (
  assignmentNumber: number,
  overrides: Partial<TeamDispatchAssignment> = {},
): TeamDispatchAssignment => {
  return {
    assignmentNumber,
    status: "awaiting_human_approval",
    repository: null,
    requestTitle: `Assignment ${assignmentNumber}`,
    conventionalTitle: null,
    requestText: "Support thread slash commands.",
    requestedAt: FIXED_TIMESTAMP,
    startedAt: FIXED_TIMESTAMP,
    finishedAt: null,
    updatedAt: FIXED_TIMESTAMP,
    plannerSummary: "Planner summary",
    plannerDeliverable: "Planner deliverable",
    branchPrefix: "requests/thread-command",
    canonicalBranchName: `requests/thread-command/a${assignmentNumber}`,
    baseBranch: "main",
    threadSlot: 1,
    plannerWorktreePath: "/tmp/meow-1",
    workerCount: 1,
    lanes: [createLane()],
    plannerNotes: [],
    humanFeedback: [],
    supersededAt: null,
    supersededReason: null,
    ...overrides,
  };
};

const createThread = (
  assignments: TeamDispatchAssignment[],
  overrides: Partial<TeamThreadRecord> = {},
): TeamThreadRecord => {
  return {
    threadId: "thread-1",
    data: {} as TeamThreadRecord["data"],
    results: [],
    userMessages: [],
    dispatchAssignments: assignments,
    archivedAt: null,
    run: {
      status: "awaiting_human_approval",
      startedAt: FIXED_TIMESTAMP,
      finishedAt: null,
      lastError: null,
    },
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    ...overrides,
  };
};

const createExecutors = (
  overrides: Partial<ThreadCommandExecutors> = {},
): ThreadCommandExecutors => {
  return {
    runApproval: vi.fn(async () => undefined),
    startReplan: vi.fn(async () => ({
      accepted: true as const,
      startedAt: FIXED_TIMESTAMP,
      status: "planning" as const,
      threadId: "thread-1",
    })),
    ...overrides,
  };
};

describe("executeThreadCommandForThread", () => {
  it("rejects busy latest assignments before executing a command", async () => {
    const thread = createThread([
      createAssignment(1, {
        lanes: [createLane({ laneId: "lane-1", laneIndex: 1, status: "coding" })],
      }),
    ]);

    await expect(
      executeThreadCommandForThread({
        command: parseThreadCommand("/approve 1"),
        thread,
      }),
    ).rejects.toMatchObject({
      message:
        "Thread commands only run while the latest assignment is idle. Wait for queued, coding, or reviewing work to finish first.",
      statusCode: 409,
    });
  });

  it("resolves proposal numbers against the latest assignment only", async () => {
    const thread = createThread([
      createAssignment(1, {
        lanes: [createLane({ laneId: "lane-legacy", laneIndex: 2 })],
      }),
      createAssignment(2, {
        lanes: [createLane({ laneId: "lane-current", laneIndex: 1 })],
      }),
    ]);

    await expect(
      executeThreadCommandForThread({
        command: parseThreadCommand("/approve 2"),
        thread,
      }),
    ).rejects.toMatchObject({
      message: "Proposal 2 was not found on the latest assignment.",
      statusCode: 400,
    });
  });

  it("runs batch proposal approvals sequentially and reports skipped lanes", async () => {
    let resolveFirstApproval: (() => void) | null = null;
    const order: string[] = [];
    const executors = createExecutors({
      runApproval: vi.fn(({ laneId }) => {
        order.push(`start:${laneId}`);
        if (laneId === "lane-1") {
          return new Promise<void>((resolve) => {
            resolveFirstApproval = () => {
              order.push(`finish:${laneId}`);
              resolve();
            };
          });
        }

        order.push(`finish:${laneId}`);
        return Promise.resolve();
      }),
    });
    const thread = createThread([
      createAssignment(1, {
        lanes: [
          createLane({ laneId: "lane-1", laneIndex: 1, status: "awaiting_human_approval" }),
          createLane({
            laneId: "lane-2",
            laneIndex: 2,
            status: "approved",
            pullRequest: createPullRequest(),
          }),
          createLane({ laneId: "lane-3", laneIndex: 3, status: "awaiting_human_approval" }),
        ],
      }),
    ]);

    const resultPromise = executeThreadCommandForThread({
      command: parseThreadCommand("/approve"),
      executors,
      thread,
    });

    await Promise.resolve();
    expect(order).toEqual(["start:lane-1"]);

    const releaseFirstApproval = resolveFirstApproval as (() => void) | null;
    if (releaseFirstApproval) {
      releaseFirstApproval();
    }
    const result = await resultPromise;

    expect(order).toEqual(["start:lane-1", "finish:lane-1", "start:lane-3", "finish:lane-3"]);
    expect(result.outcome).toBe("partial");
    expect(result.message).toContain("Queued proposal approval for proposals 1 and 3.");
    expect(result.message).toContain(
      "Skipped proposal 2 because it is not awaiting proposal approval.",
    );
  });

  it("stops a batch final-approval command after a hard failure", async () => {
    const order: string[] = [];
    const executors = createExecutors({
      runApproval: vi.fn(async ({ laneId }) => {
        order.push(laneId);
        if (laneId === "lane-2") {
          throw new Error("archive continuation failed");
        }
      }),
    });
    const readyLane = (laneId: string, laneIndex: number) =>
      createLane({
        laneId,
        laneIndex,
        status: "approved",
        pullRequest: createPullRequest(),
      });
    const thread = createThread([
      createAssignment(1, {
        status: "approved",
        lanes: [readyLane("lane-1", 1), readyLane("lane-2", 2), readyLane("lane-3", 3)],
      }),
    ]);

    const result = await executeThreadCommandForThread({
      command: parseThreadCommand("/ready"),
      executors,
      thread,
    });

    expect(order).toEqual(["lane-1", "lane-2"]);
    expect(result.outcome).toBe("partial");
    expect(result.message).toContain("Queued final approval for proposal 1.");
    expect(result.message).toContain("Stopped on proposal 2: archive continuation failed");
  });

  it("routes proposal and request-group replans through the existing helper inputs", async () => {
    const executors = createExecutors();
    const thread = createThread([
      createAssignment(1, {
        status: "approved",
        lanes: [
          createLane({
            laneId: "lane-1",
            laneIndex: 1,
            status: "approved",
            pullRequest: createPullRequest(),
          }),
        ],
      }),
    ]);

    const proposalResult = await executeThreadCommandForThread({
      command: parseThreadCommand("/replan 1 tighten the scope"),
      executors,
      thread,
    });
    const assignmentResult = await executeThreadCommandForThread({
      command: parseThreadCommand("/replan-all reduce to one proposal"),
      executors,
      thread,
    });

    expect(executors.startReplan).toHaveBeenNthCalledWith(1, {
      threadId: "thread-1",
      assignmentNumber: 1,
      scope: "proposal",
      laneId: "lane-1",
      suggestion: "tighten the scope",
    });
    expect(executors.startReplan).toHaveBeenNthCalledWith(2, {
      threadId: "thread-1",
      assignmentNumber: 1,
      scope: "assignment",
      suggestion: "reduce to one proposal",
    });
    expect(proposalResult.outcome).toBe("accepted");
    expect(assignmentResult.outcome).toBe("accepted");
  });
});
