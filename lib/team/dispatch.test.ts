import { describe, expect, it } from "vitest";
import {
  assignPendingDispatchThreadSlots,
  assignPendingDispatchWorkerSlots,
} from "@/lib/team/dispatch";
import type { PendingDispatchAssignment } from "@/lib/team/history";
import type { TeamRepositoryOption } from "@/lib/team/repository-types";
import type { TeamDispatchAssignment, TeamWorkerLaneRecord } from "@/lib/team/types";

const FIXED_TIMESTAMP = "2026-04-11T08:00:00.000Z";

const repository: TeamRepositoryOption = {
  id: "repo-1",
  name: "Repository",
  rootId: "root-1",
  rootLabel: "Root",
  path: "/tmp/repository",
  relativePath: ".",
};

const createLane = ({
  laneId,
  laneIndex,
  status,
  workerSlot = null,
  worktreePath = null,
  queuedAt = FIXED_TIMESTAMP,
}: {
  laneId: string;
  laneIndex: number;
  status: TeamWorkerLaneRecord["status"];
  workerSlot?: number | null;
  worktreePath?: string | null;
  queuedAt?: string | null;
}): TeamWorkerLaneRecord => {
  return {
    laneId,
    laneIndex,
    status,
    taskTitle: `Task ${laneIndex}`,
    taskObjective: `Objective ${laneIndex}`,
    proposalChangeName: `change-${laneId}`,
    proposalPath: `openspec/changes/change-${laneId}`,
    workerSlot,
    branchName: `requests/test/a1-proposal-${laneIndex}`,
    baseBranch: "main",
    worktreePath,
    latestImplementationCommit: null,
    pushedCommit: null,
    latestCoderHandoff: null,
    latestReviewerHandoff: null,
    latestDecision: null,
    latestCoderSummary: null,
    latestReviewerSummary: null,
    latestActivity: null,
    approvalRequestedAt: null,
    approvalGrantedAt: null,
    queuedAt,
    runCount: 0,
    revisionCount: 0,
    requeueReason: null,
    lastError: null,
    pullRequest: null,
    events: [],
    startedAt: null,
    finishedAt: null,
    updatedAt: FIXED_TIMESTAMP,
  };
};

const createPendingAssignment = ({
  threadId,
  assignmentNumber,
  lanes,
  status = "running",
  threadSlot = null,
  plannerWorktreePath = null,
}: {
  threadId: string;
  assignmentNumber: number;
  lanes: TeamWorkerLaneRecord[];
  status?: TeamDispatchAssignment["status"];
  threadSlot?: number | null;
  plannerWorktreePath?: string | null;
}): PendingDispatchAssignment => {
  const assignment: TeamDispatchAssignment = {
    assignmentNumber,
    status,
    repository,
    requestTitle: "Request",
    requestText: "Implement the request.",
    requestedAt: FIXED_TIMESTAMP,
    startedAt: FIXED_TIMESTAMP,
    finishedAt: null,
    updatedAt: FIXED_TIMESTAMP,
    plannerSummary: "Plan summary",
    plannerDeliverable: "Plan deliverable",
    branchPrefix: "test",
    canonicalBranchName: `requests/test/a${assignmentNumber}`,
    baseBranch: "main",
    threadSlot,
    plannerWorktreePath,
    workerCount: 3,
    lanes,
    plannerNotes: [],
    humanFeedback: [],
    supersededAt: null,
    supersededReason: null,
  };

  return {
    threadId,
    assignment,
  };
};

describe("assignPendingDispatchThreadSlots", () => {
  it("assigns shared meow-N slots across active threads and preserves a claimed slot", () => {
    const pendingAssignments = [
      createPendingAssignment({
        threadId: "thread-1",
        assignmentNumber: 1,
        lanes: [
          createLane({
            laneId: "thread-1-lane-1",
            laneIndex: 1,
            status: "awaiting_human_approval",
          }),
        ],
      }),
      createPendingAssignment({
        threadId: "thread-2",
        assignmentNumber: 1,
        threadSlot: 2,
        plannerWorktreePath: "/tmp/worktrees/meow-2",
        lanes: [
          createLane({
            laneId: "thread-2-lane-1",
            laneIndex: 1,
            status: "awaiting_human_approval",
          }),
        ],
      }),
      createPendingAssignment({
        threadId: "thread-3",
        assignmentNumber: 1,
        lanes: [
          createLane({
            laneId: "thread-3-lane-1",
            laneIndex: 1,
            status: "awaiting_human_approval",
          }),
        ],
      }),
      createPendingAssignment({
        threadId: "thread-4",
        assignmentNumber: 1,
        lanes: [
          createLane({
            laneId: "thread-4-lane-1",
            laneIndex: 1,
            status: "awaiting_human_approval",
          }),
        ],
      }),
    ];

    assignPendingDispatchThreadSlots({
      pendingAssignments,
      workerCount: 3,
      resolveAssignmentWorktreeRoot: () => "/tmp/worktrees",
    });

    expect(pendingAssignments[0].assignment.threadSlot).toBe(1);
    expect(pendingAssignments[0].assignment.plannerWorktreePath).toBe("/tmp/worktrees/meow-1");
    expect(pendingAssignments[1].assignment.threadSlot).toBe(2);
    expect(pendingAssignments[1].assignment.plannerWorktreePath).toBe("/tmp/worktrees/meow-2");
    expect(pendingAssignments[2].assignment.threadSlot).toBe(3);
    expect(pendingAssignments[2].assignment.plannerWorktreePath).toBe("/tmp/worktrees/meow-3");
    expect(pendingAssignments[3].assignment.threadSlot).toBeNull();
    expect(pendingAssignments[3].assignment.plannerWorktreePath).toBeNull();
  });

  it("releases a slot when a terminal thread leaves the active set", () => {
    const pendingAssignments = [
      createPendingAssignment({
        threadId: "thread-1",
        assignmentNumber: 1,
        threadSlot: 1,
        plannerWorktreePath: "/tmp/worktrees/meow-1",
        lanes: [
          createLane({
            laneId: "thread-1-lane-1",
            laneIndex: 1,
            status: "awaiting_human_approval",
          }),
        ],
      }),
      createPendingAssignment({
        threadId: "thread-2",
        assignmentNumber: 1,
        lanes: [
          createLane({
            laneId: "thread-2-lane-1",
            laneIndex: 1,
            status: "awaiting_human_approval",
          }),
        ],
      }),
    ];

    assignPendingDispatchThreadSlots({
      pendingAssignments,
      workerCount: 1,
      resolveAssignmentWorktreeRoot: () => "/tmp/worktrees",
    });

    expect(pendingAssignments[1].assignment.threadSlot).toBeNull();

    assignPendingDispatchThreadSlots({
      pendingAssignments: [pendingAssignments[1]],
      workerCount: 1,
      resolveAssignmentWorktreeRoot: () => "/tmp/worktrees",
    });

    expect(pendingAssignments[1].assignment.threadSlot).toBe(1);
    expect(pendingAssignments[1].assignment.plannerWorktreePath).toBe("/tmp/worktrees/meow-1");
  });

  it("derives a thread slot from legacy lane metadata", () => {
    const pendingAssignments = [
      createPendingAssignment({
        threadId: "thread-1",
        assignmentNumber: 1,
        lanes: [
          createLane({
            laneId: "thread-1-lane-1",
            laneIndex: 1,
            status: "coding",
            workerSlot: null,
            worktreePath: "/tmp/worktrees/meow-2",
          }),
        ],
      }),
    ];

    assignPendingDispatchThreadSlots({
      pendingAssignments,
      workerCount: 3,
      resolveAssignmentWorktreeRoot: () => "/tmp/worktrees",
    });

    expect(pendingAssignments[0].assignment.threadSlot).toBe(2);
    expect(pendingAssignments[0].assignment.plannerWorktreePath).toBe("/tmp/worktrees/meow-2");
  });
});

describe("assignPendingDispatchWorkerSlots", () => {
  it("preserves an active lane's slot and only starts one queued lane per thread", () => {
    const pendingAssignments = [
      createPendingAssignment({
        threadId: "thread-1",
        assignmentNumber: 1,
        threadSlot: 1,
        plannerWorktreePath: "/tmp/worktrees/meow-1",
        lanes: [
          createLane({
            laneId: "thread-1-lane-1",
            laneIndex: 1,
            status: "coding",
            workerSlot: 1,
            worktreePath: "/tmp/worktrees/meow-1",
          }),
          createLane({
            laneId: "thread-1-lane-2",
            laneIndex: 2,
            status: "queued",
            queuedAt: "2026-04-11T08:01:00.000Z",
          }),
        ],
      }),
      createPendingAssignment({
        threadId: "thread-2",
        assignmentNumber: 1,
        threadSlot: 2,
        plannerWorktreePath: "/tmp/worktrees/meow-2",
        lanes: [
          createLane({
            laneId: "thread-2-lane-1",
            laneIndex: 1,
            status: "queued",
            queuedAt: "2026-04-11T08:02:00.000Z",
          }),
        ],
      }),
    ];

    assignPendingDispatchWorkerSlots({
      pendingAssignments,
      resolveAssignmentWorktreeRoot: () => "/tmp/worktrees",
    });

    expect(pendingAssignments[0].assignment.lanes[0].workerSlot).toBe(1);
    expect(pendingAssignments[0].assignment.lanes[0].worktreePath).toBe("/tmp/worktrees/meow-1");
    expect(pendingAssignments[0].assignment.lanes[1].workerSlot).toBeNull();
    expect(pendingAssignments[0].assignment.lanes[1].worktreePath).toBeNull();
    expect(pendingAssignments[1].assignment.lanes[0].workerSlot).toBe(2);
    expect(pendingAssignments[1].assignment.lanes[0].worktreePath).toBe("/tmp/worktrees/meow-2");
  });

  it("avoids planner and lane collisions by keeping a queued lane on its thread slot", () => {
    const pendingAssignments = [
      createPendingAssignment({
        threadId: "thread-1",
        assignmentNumber: 1,
        threadSlot: 1,
        plannerWorktreePath: "/tmp/worktrees/meow-1",
        lanes: [
          createLane({
            laneId: "thread-1-lane-1",
            laneIndex: 1,
            status: "awaiting_human_approval",
          }),
        ],
      }),
      createPendingAssignment({
        threadId: "thread-2",
        assignmentNumber: 1,
        threadSlot: 2,
        plannerWorktreePath: "/tmp/worktrees/meow-2",
        lanes: [
          createLane({
            laneId: "thread-2-lane-1",
            laneIndex: 1,
            status: "queued",
            queuedAt: "2026-04-11T08:01:00.000Z",
          }),
        ],
      }),
    ];

    assignPendingDispatchWorkerSlots({
      pendingAssignments,
      resolveAssignmentWorktreeRoot: () => "/tmp/worktrees",
    });

    expect(pendingAssignments[1].assignment.lanes[0].workerSlot).toBe(2);
    expect(pendingAssignments[1].assignment.lanes[0].worktreePath).toBe("/tmp/worktrees/meow-2");
  });

  it("reuses a preserved thread slot for queued work after worker count shrinks", () => {
    const pendingAssignments = [
      createPendingAssignment({
        threadId: "thread-1",
        assignmentNumber: 1,
        threadSlot: 1,
        plannerWorktreePath: "/tmp/worktrees/meow-1",
        lanes: [
          createLane({
            laneId: "thread-1-lane-1",
            laneIndex: 1,
            status: "awaiting_human_approval",
          }),
        ],
      }),
      createPendingAssignment({
        threadId: "thread-2",
        assignmentNumber: 1,
        threadSlot: 3,
        plannerWorktreePath: "/tmp/worktrees/meow-3",
        lanes: [
          createLane({
            laneId: "thread-2-lane-1",
            laneIndex: 1,
            status: "queued",
            queuedAt: "2026-04-11T08:01:00.000Z",
          }),
        ],
      }),
    ];

    assignPendingDispatchWorkerSlots({
      pendingAssignments,
      resolveAssignmentWorktreeRoot: () => "/tmp/worktrees",
    });

    expect(pendingAssignments[1].assignment.lanes[0].workerSlot).toBe(3);
    expect(pendingAssignments[1].assignment.lanes[0].worktreePath).toBe("/tmp/worktrees/meow-3");
  });
});
