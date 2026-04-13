import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  archiveTeamThread,
  getTeamRepositoryPickerModel,
  getTeamThreadRecord,
  getTeamWorkspaceThreadSummaryLists,
  getTeamWorkspaceStatusSnapshot,
  updateTeamThreadRecord,
} from "@/lib/team/history";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import type { TeamRunState } from "@/lib/team/coding/shared";
import {
  resetTeamThreadStorageStateCacheForTests,
  resolveTeamThreadStorageLocation,
  updateTeamThreadStorageRecord,
} from "@/lib/storage/thread";
import type {
  TeamDispatchAssignment,
  TeamThreadStatus,
  TeamWorkerLaneRecord,
} from "@/lib/team/types";

const FIXED_TIMESTAMP = "2026-04-11T08:00:00.000Z";
const temporaryFiles = new Set<string>();

const trackTemporaryStore = (storePath: string): void => {
  const { legacyJsonPath, sqlitePath } = resolveTeamThreadStorageLocation(storePath);
  temporaryFiles.add(storePath);
  if (legacyJsonPath) {
    temporaryFiles.add(legacyJsonPath);
  }
  temporaryFiles.add(sqlitePath);
  temporaryFiles.add(`${sqlitePath}-shm`);
  temporaryFiles.add(`${sqlitePath}-wal`);
};

const createSqliteStorePath = (prefix: string): string => {
  return path.join(os.tmpdir(), `${prefix}-${crypto.randomUUID()}.sqlite`);
};

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
    conventionalTitle: null,
    requestText: "Implement the request.",
    latestInput: "Implement the request.",
    forceReset: false,
  };
};

const createRepository = (id: string): TeamRepositoryOption => {
  return {
    id,
    name: id.split(":").at(-1) ?? id,
    rootId: "workspace",
    rootLabel: "Workspace",
    path: `/repos/${id}`,
    relativePath: id.split(":").at(-1) ?? ".",
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
    executionPhase: null,
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
  repository = null,
  status,
  timestamp = FIXED_TIMESTAMP,
}: {
  lanes: TeamWorkerLaneRecord[];
  repository?: TeamRepositoryOption | null;
  status: TeamDispatchAssignment["status"];
  timestamp?: string;
}): TeamDispatchAssignment => {
  return {
    assignmentNumber: 1,
    status,
    repository,
    requestTitle: "Request",
    conventionalTitle: null,
    requestText: "Implement the request.",
    requestedAt: timestamp,
    startedAt: timestamp,
    finishedAt: status === "approved" ? timestamp : null,
    updatedAt: timestamp,
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
  repository = null,
  archivedAt = null,
  timestamp = FIXED_TIMESTAMP,
}: {
  threadId: string;
  status: TeamThreadStatus;
  dispatchAssignments?: TeamDispatchAssignment[];
  repository?: TeamRepositoryOption | null;
  archivedAt?: string | null;
  timestamp?: string;
}) => {
  const state = createRunState();
  state.selectedRepository = repository;

  return {
    threadId,
    data: state,
    results: [],
    userMessages: [
      {
        id: `${threadId}-message`,
        role: "user" as const,
        content: "Implement the request.",
        timestamp,
      },
    ],
    dispatchAssignments,
    archivedAt,
    run: {
      status,
      startedAt: timestamp,
      finishedAt: status === "approved" ? timestamp : null,
      lastError: null,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

type StoredThreadFixture = ReturnType<typeof createStoredThread>;

const writeStoredThreadToSqlite = async (
  storePath: string,
  thread: StoredThreadFixture,
): Promise<void> => {
  await updateTeamThreadStorageRecord({
    threadFile: storePath,
    threadId: thread.threadId,
    updater: () => ({
      value: undefined,
      nextRecord: {
        threadId: thread.threadId,
        payloadJson: JSON.stringify(thread),
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      },
    }),
  });
};

const writeStoredThreadsToSqlite = async (
  storePath: string,
  threads: Record<string, StoredThreadFixture>,
): Promise<void> => {
  for (const thread of Object.values(threads)) {
    await writeStoredThreadToSqlite(storePath, thread);
  }
};

afterEach(async () => {
  await resetTeamThreadStorageStateCacheForTests();

  await Promise.all(
    [...temporaryFiles].map(async (filePath) => {
      await fs.rm(filePath, { force: true });
    }),
  );

  temporaryFiles.clear();
});

describe("getTeamWorkspaceStatusSnapshot", () => {
  it("counts active threads and lane states across the full store", async () => {
    const storePath = createSqliteStorePath("team-history-status");
    trackTemporaryStore(storePath);

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
        "archived-completed",
        createStoredThread({
          threadId: "archived-completed",
          status: "completed",
          archivedAt: "2026-04-11T10:00:00.000Z",
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

    await writeStoredThreadsToSqlite(storePath, threads);

    const snapshot = await getTeamWorkspaceStatusSnapshot(storePath);

    expect(snapshot).toEqual({
      activeThreadCount: 26,
      livingThreadCount: 27,
      archivedThreadCount: 1,
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

  it("splits living and archived summaries before applying the living thread limit", async () => {
    const storePath = createSqliteStorePath("team-history-archives");
    trackTemporaryStore(storePath);

    await writeStoredThreadsToSqlite(storePath, {
      "archived-newer-1": createStoredThread({
        threadId: "archived-newer-1",
        status: "completed",
        archivedAt: "2026-04-11T12:00:00.000Z",
        timestamp: "2026-04-11T12:00:00.000Z",
      }),
      "archived-newer-2": createStoredThread({
        threadId: "archived-newer-2",
        status: "completed",
        archivedAt: "2026-04-11T11:00:00.000Z",
        timestamp: "2026-04-11T11:00:00.000Z",
      }),
      "living-older": createStoredThread({
        threadId: "living-older",
        status: "completed",
        timestamp: "2026-04-11T10:00:00.000Z",
      }),
    });

    const threadLists = await getTeamWorkspaceThreadSummaryLists(storePath, {
      livingLimit: 1,
    });

    expect(threadLists.threads.map((thread) => thread.threadId)).toEqual(["living-older"]);
    expect(threadLists.archivedThreads.map((thread) => thread.threadId)).toEqual([
      "archived-newer-1",
      "archived-newer-2",
    ]);
  });

  it("archives inactive threads and rejects active threads", async () => {
    const storePath = createSqliteStorePath("team-history-archive-thread");
    trackTemporaryStore(storePath);

    await writeStoredThreadsToSqlite(storePath, {
      inactive: createStoredThread({
        threadId: "inactive",
        status: "completed",
      }),
      active: createStoredThread({
        threadId: "active",
        status: "running",
      }),
      "awaiting-final-approval": createStoredThread({
        threadId: "awaiting-final-approval",
        status: "approved",
        dispatchAssignments: [
          createAssignment({
            status: "approved",
            lanes: [
              {
                ...createLane({
                  laneId: "awaiting-final-approval-lane-1",
                  laneIndex: 1,
                  status: "approved",
                }),
                pullRequest: {
                  id: "pr-awaiting-final-approval",
                  provider: "local-ci",
                  title: "Await final approval",
                  summary: "Machine review approved the branch.",
                  branchName: "requests/example/a1-proposal-1",
                  baseBranch: "main",
                  status: "awaiting_human_approval",
                  requestedAt: FIXED_TIMESTAMP,
                  humanApprovalRequestedAt: FIXED_TIMESTAMP,
                  humanApprovedAt: null,
                  machineReviewedAt: FIXED_TIMESTAMP,
                  updatedAt: FIXED_TIMESTAMP,
                  url: null,
                },
              },
            ],
          }),
        ],
      }),
    });

    const archivedThread = await archiveTeamThread({
      threadFile: storePath,
      threadId: "inactive",
    });
    const threadLists = await getTeamWorkspaceThreadSummaryLists(storePath);

    expect(archivedThread.summary.archivedAt).not.toBeNull();
    expect(threadLists.threads.map((thread) => thread.threadId)).not.toContain("inactive");
    expect(threadLists.archivedThreads.map((thread) => thread.threadId)).toContain("inactive");

    await expect(
      archiveTeamThread({
        threadFile: storePath,
        threadId: "active",
      }),
    ).rejects.toThrow("Only inactive threads can be archived.");
    await expect(
      archiveTeamThread({
        threadFile: storePath,
        threadId: "awaiting-final-approval",
      }),
    ).rejects.toThrow("Only inactive threads can be archived.");
  });

  it("imports a legacy JSON store once and persists later updates in SQLite", async () => {
    const storePath = path.join(os.tmpdir(), `team-history-import-${crypto.randomUUID()}.json`);
    trackTemporaryStore(storePath);

    await fs.writeFile(
      storePath,
      JSON.stringify(
        {
          threads: {
            "imported-thread": createStoredThread({
              threadId: "imported-thread",
              status: "running",
            }),
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const importedThread = await getTeamThreadRecord(storePath, "imported-thread");
    expect(importedThread?.threadId).toBe("imported-thread");

    await fs.rm(storePath, { force: true });

    await updateTeamThreadRecord({
      threadFile: storePath,
      threadId: "imported-thread",
      updater: (thread) => {
        thread.data.requestTitle = "Imported Title";
      },
    });

    const migratedThread = await getTeamThreadRecord(storePath, "imported-thread");
    expect(migratedThread?.data.requestTitle).toBe("Imported Title");
  });

  it("normalizes older lane records that do not yet include pushed commit metadata", async () => {
    const storePath = createSqliteStorePath("team-history-legacy");
    trackTemporaryStore(storePath);

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
    const serializedLegacyLane = serializedLegacyThread.dispatchAssignments[0]?.lanes[0] as
      | { pushedCommit?: unknown }
      | undefined;

    if (serializedLegacyLane) {
      Reflect.deleteProperty(serializedLegacyLane, "pushedCommit");
    }

    await writeStoredThreadToSqlite(storePath, serializedLegacyThread);

    const thread = await getTeamThreadRecord(storePath, "legacy-thread");

    expect(thread?.dispatchAssignments[0]?.lanes[0]?.pushedCommit).toBeNull();
    expect(thread?.dispatchAssignments[0]?.lanes[0]?.latestImplementationCommit).toBe(
      "1234567890abcdef1234567890abcdef12345678",
    );
  });

  it("marks fully finalized machine-reviewed lanes as completed once GitHub delivery is ready", async () => {
    const storePath = createSqliteStorePath("team-history-completed");
    trackTemporaryStore(storePath);

    const finalizedThread = createStoredThread({
      threadId: "finalized-thread",
      status: "approved",
      dispatchAssignments: [
        createAssignment({
          status: "approved",
          lanes: [
            {
              ...createLane({
                laneId: "finalized-thread-lane-1",
                laneIndex: 1,
                status: "approved",
              }),
              pullRequest: {
                id: "pr-1",
                provider: "github",
                title: "Ready for merge",
                summary: "Machine review approved the branch.",
                branchName: "requests/example/a1-proposal-1",
                baseBranch: "main",
                status: "approved",
                requestedAt: FIXED_TIMESTAMP,
                humanApprovalRequestedAt: FIXED_TIMESTAMP,
                humanApprovedAt: FIXED_TIMESTAMP,
                machineReviewedAt: FIXED_TIMESTAMP,
                updatedAt: FIXED_TIMESTAMP,
                url: "https://github.com/example/meow-team/pull/42",
              },
            },
          ],
        }),
      ],
    });

    await writeStoredThreadToSqlite(storePath, finalizedThread);

    const thread = await getTeamThreadRecord(storePath, "finalized-thread");

    expect(thread?.dispatchAssignments[0]?.status).toBe("completed");
    expect(thread?.run?.status).toBe("completed");
  });
});

describe("getTeamRepositoryPickerModel", () => {
  it("reads the full stored history instead of only the latest thread summary window", async () => {
    const storePath = path.join(
      os.tmpdir(),
      `team-history-repository-picker-${crypto.randomUUID()}.json`,
    );
    trackTemporaryStore(storePath);

    const alphaRepository = createRepository("workspace:alpha");
    const betaRepository = createRepository("workspace:beta");
    const gammaRepository = createRepository("workspace:gamma");

    const alphaThreads = Array.from({ length: 24 }, (_, index) => {
      const threadId = `alpha-${index + 1}`;
      const day = String(24 - index).padStart(2, "0");

      return [
        threadId,
        createStoredThread({
          threadId,
          status: "completed",
          repository: alphaRepository,
          timestamp: `2026-04-${day}T08:00:00.000Z`,
        }),
      ] as const;
    });

    await fs.writeFile(
      storePath,
      JSON.stringify(
        {
          threads: Object.fromEntries([
            ...alphaThreads,
            [
              "beta-history-thread",
              createStoredThread({
                threadId: "beta-history-thread",
                status: "completed",
                repository: betaRepository,
                timestamp: "2026-03-31T08:00:00.000Z",
              }),
            ],
          ]),
        },
        null,
        2,
      ),
      "utf8",
    );

    const picker = await getTeamRepositoryPickerModel({
      threadFile: storePath,
      repositories: [alphaRepository, betaRepository, gammaRepository],
    });

    expect(picker.suggestedRepositories.map((repository) => repository.id)).toEqual([
      alphaRepository.id,
      betaRepository.id,
    ]);
    expect(picker.orderedRepositories.map((repository) => repository.id)).toEqual([
      alphaRepository.id,
      betaRepository.id,
      gammaRepository.id,
    ]);
  });
});
