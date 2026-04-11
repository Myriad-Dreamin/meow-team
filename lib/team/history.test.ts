import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getTeamThreadRecord, getTeamWorkspaceStatusSnapshot } from "@/lib/team/history";
import type { TeamRunState } from "@/lib/team/network";
import type {
  TeamDispatchAssignment,
  TeamThreadStatus,
  TeamWorkerLaneRecord,
} from "@/lib/team/types";

const FIXED_TIMESTAMP = "2026-04-11T08:00:00.000Z";
const temporaryFiles = new Set<string>();

const createRunState = (): TeamRunState => {
  return {
    teamId: "test-team",
    teamName: "Test Team",
    ownerName: "Owner",
    objective: "Keep the queue moving.",
    selectedRepository: null,
    workflow: ["planner", "coder", "reviewer"],
    handoffs: {},
    handoffCounter: 0,
    assignmentNumber: 1,
    requestTitle: null,
    requestText: "Implement the request.",
    latestInput: "Implement the request.",
    forceReset: false,
  };
};

const createLane = ({
  laneId,
  laneIndex,
  status,
}: {
  laneId: string;
  laneIndex: number;
  status: TeamWorkerLaneRecord["status"];
}): TeamWorkerLaneRecord => {
  return {
    laneId,
    laneIndex,
    status,
    taskTitle: `Task ${laneIndex}`,
    taskObjective: `Objective ${laneIndex}`,
    proposalChangeName: null,
    proposalPath: null,
    workerSlot: null,
    branchName: null,
    baseBranch: null,
    worktreePath: null,
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
    queuedAt: null,
    runCount: 0,
    revisionCount: 0,
    requeueReason: null,
    lastError: null,
    pullRequest: null,
    events: [],
    startedAt: FIXED_TIMESTAMP,
    finishedAt: null,
    updatedAt: FIXED_TIMESTAMP,
  };
};

const createAssignment = ({
  lanes,
  status,
}: {
  lanes: TeamWorkerLaneRecord[];
  status: TeamDispatchAssignment["status"];
}): TeamDispatchAssignment => {
  return {
    assignmentNumber: 1,
    status,
    repository: null,
    requestTitle: "Request",
    requestText: "Implement the request.",
    requestedAt: FIXED_TIMESTAMP,
    startedAt: FIXED_TIMESTAMP,
    finishedAt: status === "approved" ? FIXED_TIMESTAMP : null,
    updatedAt: FIXED_TIMESTAMP,
    plannerSummary: null,
    plannerDeliverable: null,
    branchPrefix: null,
    canonicalBranchName: null,
    baseBranch: null,
    workerCount: lanes.length,
    lanes,
    plannerNotes: [],
    humanFeedback: [],
    supersededAt: null,
    supersededReason: null,
  };
};

const createStoredThread = ({
  threadId,
  status,
  dispatchAssignments = [],
}: {
  threadId: string;
  status: TeamThreadStatus;
  dispatchAssignments?: TeamDispatchAssignment[];
}) => {
  return {
    threadId,
    data: createRunState(),
    results: [],
    userMessages: [
      {
        id: `${threadId}-message`,
        role: "user" as const,
        content: "Implement the request.",
        timestamp: FIXED_TIMESTAMP,
      },
    ],
    dispatchAssignments,
    run: {
      status,
      startedAt: FIXED_TIMESTAMP,
      finishedAt: status === "approved" ? FIXED_TIMESTAMP : null,
      lastError: null,
    },
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
};

afterEach(async () => {
  await Promise.all(
    [...temporaryFiles].map(async (filePath) => {
      await fs.rm(filePath, { force: true });
    }),
  );

  temporaryFiles.clear();
});

describe("getTeamWorkspaceStatusSnapshot", () => {
  it("counts active threads and lane states across the full store", async () => {
    const storePath = path.join(os.tmpdir(), `team-history-status-${crypto.randomUUID()}.json`);
    temporaryFiles.add(storePath);

    const activeCodingThreads = Array.from({ length: 24 }, (_, index) => {
      const threadId = `coding-${index + 1}`;

      return [
        threadId,
        createStoredThread({
          threadId,
          status: "running",
          dispatchAssignments: [
            createAssignment({
              status: "running",
              lanes: [createLane({ laneId: `${threadId}-lane-1`, laneIndex: 1, status: "coding" })],
            }),
          ],
        }),
      ] as const;
    });

    const threads = Object.fromEntries([
      ...activeCodingThreads,
      [
        "planning-only",
        createStoredThread({
          threadId: "planning-only",
          status: "planning",
        }),
      ],
      [
        "awaiting-approval",
        createStoredThread({
          threadId: "awaiting-approval",
          status: "awaiting_human_approval",
          dispatchAssignments: [
            createAssignment({
              status: "awaiting_human_approval",
              lanes: [
                createLane({
                  laneId: "awaiting-approval-lane-1",
                  laneIndex: 1,
                  status: "awaiting_human_approval",
                }),
                createLane({
                  laneId: "awaiting-approval-lane-2",
                  laneIndex: 2,
                  status: "approved",
                }),
              ],
            }),
          ],
        }),
      ],
      [
        "machine-reviewed",
        createStoredThread({
          threadId: "machine-reviewed",
          status: "approved",
          dispatchAssignments: [
            createAssignment({
              status: "approved",
              lanes: [
                createLane({
                  laneId: "machine-reviewed-lane-1",
                  laneIndex: 1,
                  status: "approved",
                }),
              ],
            }),
          ],
        }),
      ],
    ]);

    await fs.writeFile(storePath, JSON.stringify({ threads }, null, 2), "utf8");

    const snapshot = await getTeamWorkspaceStatusSnapshot(storePath);

    expect(snapshot).toEqual({
      activeThreadCount: 26,
      livingThreadCount: 27,
      laneCounts: {
        idle: 0,
        queued: 0,
        coding: 24,
        reviewing: 0,
        awaitingHumanApproval: 1,
        approved: 1,
        failed: 0,
      },
    });
  });

  it("normalizes older lane records that do not yet include pushed commit metadata", async () => {
    const storePath = path.join(os.tmpdir(), `team-history-legacy-${crypto.randomUUID()}.json`);
    temporaryFiles.add(storePath);

    const legacyThread = createStoredThread({
      threadId: "legacy-thread",
      status: "approved",
      dispatchAssignments: [
        createAssignment({
          status: "approved",
          lanes: [
            {
              ...createLane({
                laneId: "legacy-thread-lane-1",
                laneIndex: 1,
                status: "approved",
              }),
              latestImplementationCommit: "1234567890abcdef1234567890abcdef12345678",
            },
          ],
        }),
      ],
    });

    const serializedLegacyThread = JSON.parse(JSON.stringify(legacyThread)) as typeof legacyThread;
    delete serializedLegacyThread.dispatchAssignments[0]?.lanes[0]?.pushedCommit;

    await fs.writeFile(
      storePath,
      JSON.stringify({ threads: { "legacy-thread": serializedLegacyThread } }, null, 2),
      "utf8",
    );

    const thread = await getTeamThreadRecord(storePath, "legacy-thread");

    expect(thread?.dispatchAssignments[0]?.lanes[0]?.pushedCommit).toBeNull();
    expect(thread?.dispatchAssignments[0]?.lanes[0]?.latestImplementationCommit).toBe(
      "1234567890abcdef1234567890abcdef12345678",
    );
  });
});
