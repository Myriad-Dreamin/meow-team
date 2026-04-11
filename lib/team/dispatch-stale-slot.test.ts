import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingDispatchAssignment, TeamThreadRecord } from "@/lib/team/history";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import type { TeamDispatchAssignment, TeamWorkerLaneRecord } from "@/lib/team/types";

const { getTeamThreadRecordMock, listPendingDispatchAssignmentsMock, updateTeamThreadRecordMock } =
  vi.hoisted(() => ({
    getTeamThreadRecordMock: vi.fn(),
    listPendingDispatchAssignmentsMock: vi.fn(),
    updateTeamThreadRecordMock: vi.fn(),
  }));

vi.mock("@/team.config", () => ({
  teamConfig: {
    id: "test-team",
    name: "Test Team",
    owner: {
      name: "Owner",
      objective: "Ship reliable dispatch coordination.",
    },
    model: {
      provider: "openai",
      model: "gpt-5",
      reasoningEffort: "medium",
      textVerbosity: "medium",
      maxOutputTokens: 3200,
    },
    workflow: ["planner", "coder", "reviewer"],
    storage: {
      threadFile: "data/team-threads.json",
    },
    dispatch: {
      workerCount: 1,
      maxProposalCount: 6,
      branchPrefix: "team-dispatch",
      baseBranch: "main",
      worktreeRoot: "/tmp/worktrees",
    },
    repositories: {
      roots: [],
    },
  },
}));

vi.mock("@/lib/team/history", async () => {
  const actual = await vi.importActual<typeof import("@/lib/team/history")>("@/lib/team/history");
  return {
    ...actual,
    getTeamThreadRecord: getTeamThreadRecordMock,
    listPendingDispatchAssignments: listPendingDispatchAssignmentsMock,
    updateTeamThreadRecord: updateTeamThreadRecordMock,
  };
});

import { ensurePendingDispatchWork } from "@/lib/team/dispatch";

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

const createAssignment = ({
  assignmentNumber,
  lanes,
  status = "running",
}: {
  assignmentNumber: number;
  lanes: TeamWorkerLaneRecord[];
  status?: TeamDispatchAssignment["status"];
}): TeamDispatchAssignment => {
  return {
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
    workerCount: 1,
    lanes,
    plannerNotes: [],
    humanFeedback: [],
    supersededAt: null,
    supersededReason: null,
  };
};

const createThreadRecord = ({
  threadId,
  assignment,
}: {
  threadId: string;
  assignment: TeamDispatchAssignment;
}): TeamThreadRecord => {
  return {
    threadId,
    data: {
      teamId: "test-team",
      teamName: "Test Team",
      ownerName: "Owner",
      objective: "Ship reliable dispatch coordination.",
      selectedRepository: repository,
      workflow: ["planner", "coder", "reviewer"],
      handoffs: {},
      handoffCounter: 0,
      assignmentNumber: assignment.assignmentNumber,
      requestTitle: assignment.requestTitle,
      requestText: assignment.requestText,
      latestInput: assignment.requestText,
      forceReset: false,
    },
    results: [],
    userMessages: [],
    dispatchAssignments: [assignment],
    run: {
      status: "running",
      startedAt: FIXED_TIMESTAMP,
      finishedAt: null,
      lastError: null,
    },
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
};

const buildPendingAssignmentsSnapshot = (
  threadStore: Record<string, TeamThreadRecord>,
  threadIds: string[],
): PendingDispatchAssignment[] => {
  return threadIds.map((threadId) => ({
    threadId,
    assignment: structuredClone(threadStore[threadId].dispatchAssignments[0]),
  }));
};

describe("ensurePendingDispatchWork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTeamThreadRecordMock.mockResolvedValue(null);
  });

  it("does not erase a fresher slot claim when an older allocator pass finishes later", async () => {
    const threadStore: Record<string, TeamThreadRecord> = {
      "thread-1": createThreadRecord({
        threadId: "thread-1",
        assignment: createAssignment({
          assignmentNumber: 1,
          lanes: [
            createLane({
              laneId: "thread-1-lane-1",
              laneIndex: 1,
              status: "queued",
            }),
          ],
        }),
      }),
      "thread-2": createThreadRecord({
        threadId: "thread-2",
        assignment: createAssignment({
          assignmentNumber: 1,
          lanes: [
            createLane({
              laneId: "thread-2-lane-1",
              laneIndex: 1,
              status: "reviewing",
              workerSlot: 1,
              worktreePath: "/tmp/worktrees/meow-1",
            }),
          ],
        }),
      }),
    };

    const pendingSnapshots: PendingDispatchAssignment[][] = [
      buildPendingAssignmentsSnapshot(threadStore, ["thread-1", "thread-2"]),
    ];

    let nestedPassStarted = false;

    listPendingDispatchAssignmentsMock.mockImplementation(async () => {
      return structuredClone(pendingSnapshots.shift() ?? []);
    });

    updateTeamThreadRecordMock.mockImplementation(
      async ({
        threadId,
        updater,
      }: {
        threadId: string;
        updater: (thread: TeamThreadRecord, now: string) => Promise<unknown> | unknown;
      }) => {
        if (threadId === "thread-1" && !nestedPassStarted) {
          nestedPassStarted = true;
          const releasedAssignment = threadStore["thread-2"].dispatchAssignments[0];
          const releasedLane = releasedAssignment?.lanes[0];
          if (!releasedAssignment || !releasedLane) {
            throw new Error("Thread 2 assignment setup is incomplete.");
          }

          releasedAssignment.status = "approved";
          releasedAssignment.finishedAt = FIXED_TIMESTAMP;
          releasedLane.status = "approved";
          releasedLane.workerSlot = null;
          releasedLane.worktreePath = null;
          releasedLane.finishedAt = FIXED_TIMESTAMP;
          releasedLane.updatedAt = FIXED_TIMESTAMP;

          pendingSnapshots.push(buildPendingAssignmentsSnapshot(threadStore, ["thread-1"]), [], []);

          await ensurePendingDispatchWork();
        }

        const thread = structuredClone(threadStore[threadId]);
        await updater(thread, FIXED_TIMESTAMP);
        thread.updatedAt = FIXED_TIMESTAMP;
        threadStore[threadId] = thread;
      },
    );

    await ensurePendingDispatchWork();

    const lane = threadStore["thread-1"].dispatchAssignments[0]?.lanes[0];
    expect(nestedPassStarted).toBe(true);
    expect(lane?.status).toBe("queued");
    expect(lane?.workerSlot).toBe(1);
    expect(lane?.worktreePath).toBe("/tmp/worktrees/meow-1");
  });
});
