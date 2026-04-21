import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamThreadRecord } from "@/lib/team/history";
import type { TeamDispatchAssignment, TeamWorkerLaneRecord } from "@/lib/team/types";

const { appendTeamCodexLogEventMock, getTeamThreadRecordMock, updateTeamThreadRecordMock } =
  vi.hoisted(() => ({
    appendTeamCodexLogEventMock: vi.fn(),
    getTeamThreadRecordMock: vi.fn(),
    updateTeamThreadRecordMock: vi.fn(),
  }));

vi.mock("@/team.config", () => ({
  teamConfig: {
    storage: {
      threadFile: "threads.sqlite",
    },
  },
}));

vi.mock("@/lib/team/logs", () => ({
  appendTeamCodexLogEvent: appendTeamCodexLogEventMock,
}));

vi.mock("@/lib/team/history", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/team/history")>();

  return {
    ...actual,
    getTeamThreadRecord: getTeamThreadRecordMock,
    updateTeamThreadRecord: updateTeamThreadRecordMock,
  };
});

const FIXED_TIMESTAMP = "2026-04-18T08:00:00.000Z";

const createLane = (overrides: Partial<TeamWorkerLaneRecord> = {}): TeamWorkerLaneRecord => {
  return {
    laneId: "lane-1",
    laneIndex: 1,
    status: "coding",
    executionPhase: "implementation",
    taskTitle: "Retry agents",
    taskObjective: "Retry failed agent runs.",
    proposalChangeName: "retry-agents",
    proposalPath: "openspec/changes/retry-agents",
    proposalCommitHash: null,
    finalizationMode: null,
    proposalDisposition: "active",
    finalizationCheckpoint: null,
    workerSlot: 1,
    branchName: "requests/retry-agents/a1-proposal-1",
    baseBranch: "main",
    worktreePath: "/repo/.meow-team-worktrees/meow-1",
    latestImplementationCommit: null,
    pushedCommit: null,
    latestCoderHandoff: null,
    latestReviewerHandoff: null,
    latestDecision: null,
    latestCoderSummary: null,
    latestReviewerSummary: null,
    latestActivity: null,
    approvalRequestedAt: FIXED_TIMESTAMP,
    approvalGrantedAt: FIXED_TIMESTAMP,
    queuedAt: FIXED_TIMESTAMP,
    runCount: 0,
    revisionCount: 0,
    requeueReason: null,
    retryState: null,
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
  overrides: Partial<TeamDispatchAssignment> = {},
): TeamDispatchAssignment => {
  return {
    assignmentNumber: 1,
    status: "running",
    repository: null,
    requestTitle: "Retry agents",
    conventionalTitle: null,
    requestText: "Add retry logic for agents.",
    requestedAt: FIXED_TIMESTAMP,
    startedAt: FIXED_TIMESTAMP,
    finishedAt: null,
    updatedAt: FIXED_TIMESTAMP,
    plannerSummary: "Retry failed agents.",
    plannerDeliverable: "Plan",
    branchPrefix: "requests/retry-agents",
    canonicalBranchName: "requests/retry-agents/a1",
    baseBranch: "main",
    threadSlot: 1,
    plannerWorktreePath: "/repo/.meow-team-worktrees/meow-1",
    workerCount: 1,
    lanes: [createLane()],
    plannerNotes: [],
    humanFeedback: [],
    supersededAt: null,
    supersededReason: null,
    ...overrides,
  };
};

const createThread = (): TeamThreadRecord => {
  return {
    threadId: "thread-1",
    data: {} as TeamThreadRecord["data"],
    results: [],
    userMessages: [],
    dispatchAssignments: [createAssignment()],
    archivedAt: null,
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

describe("runLaneAgentWithRetry", () => {
  let thread: TeamThreadRecord;

  beforeEach(() => {
    thread = createThread();
    appendTeamCodexLogEventMock.mockReset();
    getTeamThreadRecordMock.mockReset();
    updateTeamThreadRecordMock.mockReset();
    getTeamThreadRecordMock.mockResolvedValue(thread);
    updateTeamThreadRecordMock.mockImplementation(
      async ({
        updater,
      }: {
        updater: (thread: TeamThreadRecord, now: string) => Promise<unknown> | unknown;
      }) => updater(thread, FIXED_TIMESTAMP),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries failed agent runs and pauses for confirmation after the retry round is exhausted", async () => {
    const { TeamAgentRetryConfirmationRequiredError, runLaneAgentWithRetry } =
      await import("@/lib/team/agent-retry");
    const run = vi.fn(async () => {
      throw new Error("Codex CLI exited with status 1.");
    });

    await expect(
      runLaneAgentWithRetry({
        threadId: "thread-1",
        assignmentNumber: 1,
        laneId: "lane-1",
        roleId: "coder",
        roleName: "Coder",
        actor: "coder",
        resumeStatus: "coding",
        resumeExecutionPhase: "implementation",
        run,
        delayMs: 0,
        maxAttempts: 2,
      }),
    ).rejects.toBeInstanceOf(TeamAgentRetryConfirmationRequiredError);

    const lane = thread.dispatchAssignments[0]?.lanes[0];
    expect(run).toHaveBeenCalledTimes(3);
    expect(lane?.status).toBe("awaiting_retry_approval");
    expect(lane?.workerSlot).toBeNull();
    expect(lane?.retryState).toMatchObject({
      roleId: "coder",
      attempts: 2,
      maxAttempts: 2,
      awaitingConfirmationSince: FIXED_TIMESTAMP,
      resumeStatus: "coding",
    });
    expect(thread.dispatchAssignments[0]?.plannerNotes.at(-1)?.message).toContain(
      "exhausted 2 automatic retries",
    );
  });

  it("clears retry state after a later agent attempt succeeds", async () => {
    const { runLaneAgentWithRetry } = await import("@/lib/team/agent-retry");
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce("ok");

    await expect(
      runLaneAgentWithRetry({
        threadId: "thread-1",
        assignmentNumber: 1,
        laneId: "lane-1",
        roleId: "coder",
        roleName: "Coder",
        actor: "coder",
        resumeStatus: "coding",
        resumeExecutionPhase: "implementation",
        run,
        delayMs: 0,
        maxAttempts: 2,
      }),
    ).resolves.toBe("ok");

    const lane = thread.dispatchAssignments[0]?.lanes[0];
    expect(run).toHaveBeenCalledTimes(2);
    expect(lane?.retryState).toBeNull();
    expect(lane?.lastError).toBeNull();
  });

  it("honors the persisted retry delay before rerunning the same role", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIXED_TIMESTAMP));

    thread.dispatchAssignments[0]!.lanes[0] = createLane({
      status: "coding",
      retryState: {
        roleId: "coder",
        roleName: "Coder",
        attempts: 1,
        maxAttempts: 10,
        round: 1,
        nextRetryAt: "2026-04-18T08:01:00.000Z",
        awaitingConfirmationSince: null,
        resumeStatus: "coding",
        resumeExecutionPhase: "implementation",
        lastError: "temporary failure",
        updatedAt: FIXED_TIMESTAMP,
      },
    });

    const { runLaneAgentWithRetry } = await import("@/lib/team/agent-retry");
    const run = vi.fn<() => Promise<string>>().mockResolvedValue("ok");
    const pendingResult = runLaneAgentWithRetry({
      threadId: "thread-1",
      assignmentNumber: 1,
      laneId: "lane-1",
      roleId: "coder",
      roleName: "Coder",
      actor: "coder",
      resumeStatus: "coding",
      resumeExecutionPhase: "implementation",
      run,
      delayMs: 0,
      maxAttempts: 10,
    });

    await vi.advanceTimersByTimeAsync(59_000);
    expect(run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pendingResult).resolves.toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("confirmLaneAgentRetryRound", () => {
  let thread: TeamThreadRecord;

  beforeEach(() => {
    thread = createThread();
    appendTeamCodexLogEventMock.mockReset();
    getTeamThreadRecordMock.mockReset();
    updateTeamThreadRecordMock.mockReset();
    getTeamThreadRecordMock.mockResolvedValue(thread);
    updateTeamThreadRecordMock.mockImplementation(
      async ({
        updater,
      }: {
        updater: (thread: TeamThreadRecord, now: string) => Promise<unknown> | unknown;
      }) => updater(thread, FIXED_TIMESTAMP),
    );
  });

  it("resets attempts and advances the retry round after human confirmation", async () => {
    thread.dispatchAssignments[0]!.lanes[0] = createLane({
      status: "awaiting_retry_approval",
      executionPhase: "implementation",
      workerSlot: null,
      retryState: {
        roleId: "reviewer",
        roleName: "Reviewer",
        attempts: 10,
        maxAttempts: 10,
        round: 1,
        nextRetryAt: null,
        awaitingConfirmationSince: FIXED_TIMESTAMP,
        resumeStatus: "reviewing",
        resumeExecutionPhase: "implementation",
        lastError: "temporary failure",
        updatedAt: FIXED_TIMESTAMP,
      },
    });

    const { confirmLaneAgentRetryRound } = await import("@/lib/team/agent-retry");
    await confirmLaneAgentRetryRound({
      threadId: "thread-1",
      assignmentNumber: 1,
      laneId: "lane-1",
    });

    const lane = thread.dispatchAssignments[0]?.lanes[0];
    expect(lane?.status).toBe("reviewing");
    expect(lane?.retryState).toMatchObject({
      attempts: 0,
      round: 2,
      nextRetryAt: null,
      awaitingConfirmationSince: null,
      lastError: null,
      resumeStatus: "reviewing",
    });
    expect(lane?.latestActivity).toContain("retry round 2");
    expect(thread.dispatchAssignments[0]?.plannerNotes.at(-1)?.message).toContain(
      "Human confirmed another Reviewer retry round",
    );
  });
});
