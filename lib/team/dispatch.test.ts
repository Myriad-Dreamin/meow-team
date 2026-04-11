import { describe, expect, it } from "vitest";
import { assignPendingDispatchWorkerSlots } from "@/lib/team/dispatch";
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
}: {
  threadId: string;
  assignmentNumber: number;
  lanes: TeamWorkerLaneRecord[];
}): PendingDispatchAssignment => {
  const assignment: TeamDispatchAssignment = {
    assignmentNumber,
    status: "running",
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

describe("assignPendingDispatchWorkerSlots", () => {
  it("assigns unique slots across concurrent threads and respects the shared pool size", () => {
    const pendingAssignments = [
      createPendingAssignment({
        threadId: "thread-1",
        assignmentNumber: 1,
        lanes: [
          createLane({
            laneId: "thread-1-lane-1",
            laneIndex: 1,
            status: "coding",
            workerSlot: 1,
            worktreePath: null,
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
        lanes: [
          createLane({
            laneId: "thread-2-lane-1",
            laneIndex: 1,
            status: "reviewing",
            workerSlot: 2,
            worktreePath: null,
          }),
          createLane({
            laneId: "thread-2-lane-2",
            laneIndex: 2,
            status: "queued",
            queuedAt: "2026-04-11T08:02:00.000Z",
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
            status: "queued",
            queuedAt: "2026-04-11T08:03:00.000Z",
          }),
        ],
      }),
    ];

    assignPendingDispatchWorkerSlots({
      pendingAssignments,
      workerCount: 3,
      resolveAssignmentWorktreeRoot: () => "/tmp/worktrees",
    });

    expect(pendingAssignments[0].assignment.lanes[0].workerSlot).toBe(1);
    expect(pendingAssignments[0].assignment.lanes[0].worktreePath).toBe("/tmp/worktrees/meow-1");
    expect(pendingAssignments[1].assignment.lanes[0].workerSlot).toBe(2);
    expect(pendingAssignments[1].assignment.lanes[0].worktreePath).toBe("/tmp/worktrees/meow-2");
    expect(pendingAssignments[0].assignment.lanes[1].workerSlot).toBe(3);
    expect(pendingAssignments[0].assignment.lanes[1].worktreePath).toBe("/tmp/worktrees/meow-3");
    expect(pendingAssignments[1].assignment.lanes[1].workerSlot).toBeNull();
    expect(pendingAssignments[2].assignment.lanes[0].workerSlot).toBeNull();

    const occupiedSlots = pendingAssignments
      .flatMap((pending) => pending.assignment.lanes)
      .filter((lane) => lane.status === "queued" || lane.status === "coding" || lane.status === "reviewing")
      .flatMap((lane) => (lane.workerSlot ? [lane.workerSlot] : []));
    expect(occupiedSlots).toEqual([1, 3, 2]);
    expect(new Set(occupiedSlots).size).toBe(3);
  });

  it("preserves an active lane's slot and worktree when the lane is requeued", () => {
    const pendingAssignments = [
      createPendingAssignment({
        threadId: "thread-1",
        assignmentNumber: 1,
        lanes: [
          createLane({
            laneId: "thread-1-lane-1",
            laneIndex: 1,
            status: "coding",
            workerSlot: 1,
            worktreePath: "/tmp/worktrees/meow-1",
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
            status: "queued",
            workerSlot: 2,
            worktreePath: "/tmp/worktrees/meow-2",
            queuedAt: "2026-04-11T08:01:00.000Z",
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
            status: "queued",
            queuedAt: "2026-04-11T08:02:00.000Z",
          }),
        ],
      }),
    ];

    assignPendingDispatchWorkerSlots({
      pendingAssignments,
      workerCount: 2,
      resolveAssignmentWorktreeRoot: () => "/tmp/worktrees",
    });

    expect(pendingAssignments[1].assignment.lanes[0].workerSlot).toBe(2);
    expect(pendingAssignments[1].assignment.lanes[0].worktreePath).toBe("/tmp/worktrees/meow-2");
    expect(pendingAssignments[2].assignment.lanes[0].workerSlot).toBeNull();
    expect(pendingAssignments[2].assignment.lanes[0].worktreePath).toBeNull();
  });

  it("counts preserved out-of-range slots against the shared worker pool", () => {
    const pendingAssignments = [
      createPendingAssignment({
        threadId: "thread-1",
        assignmentNumber: 1,
        lanes: [
          createLane({
            laneId: "thread-1-lane-1",
            laneIndex: 1,
            status: "coding",
            workerSlot: 2,
            worktreePath: null,
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
            status: "queued",
            queuedAt: "2026-04-11T08:01:00.000Z",
          }),
        ],
      }),
    ];

    assignPendingDispatchWorkerSlots({
      pendingAssignments,
      workerCount: 1,
      resolveAssignmentWorktreeRoot: () => "/tmp/worktrees",
    });

    expect(pendingAssignments[0].assignment.lanes[0].workerSlot).toBe(2);
    expect(pendingAssignments[0].assignment.lanes[0].worktreePath).toBe("/tmp/worktrees/meow-2");
    expect(pendingAssignments[1].assignment.lanes[0].workerSlot).toBeNull();
    expect(pendingAssignments[1].assignment.lanes[0].worktreePath).toBeNull();
  });
});
