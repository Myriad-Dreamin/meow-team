import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamRunPlanningStageState, TeamRunState } from "@/lib/team/coding/shared";
import type { TeamThreadRecord } from "@/lib/team/history";

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

const createRunState = (): TeamRunState => {
  return {
    teamId: "team-1",
    teamName: "Meow Team",
    ownerName: "Owner",
    objective: "Keep planning stable.",
    selectedRepository: null,
    workflow: ["planner", "coder", "reviewer"],
    handoffs: {},
    handoffCounter: 0,
    assignmentNumber: 1,
    requestTitle: "Retry planner",
    conventionalTitle: null,
    executionMode: null,
    requestText: "Retry the planner.",
    threadWorktree: null,
    latestInput: "Retry the planner.",
    forceReset: false,
  };
};

const createPlanningState = (): TeamRunPlanningStageState => {
  return {
    stage: "planning",
    args: {
      kind: "planning",
      input: "Retry the planner.",
      threadId: "thread-1",
      reset: true,
    },
    context: {
      threadId: "thread-1",
      worktree: {
        path: "/tmp/meow-1",
        rootPath: null,
        slot: null,
      },
      selectedRepository: null,
      existingThread: null,
      shouldResetAssignment: true,
      state: createRunState(),
      requestMetadata: {
        requestTitle: "Retry planner",
        conventionalTitle: null,
        executionMode: null,
        requestText: "Retry the planner.",
      },
    },
  };
};

const createThread = (): TeamThreadRecord => {
  return {
    threadId: "thread-1",
    data: createRunState(),
    results: [],
    userMessages: [],
    dispatchAssignments: [],
    archivedAt: null,
    run: {
      status: "planning",
      startedAt: FIXED_TIMESTAMP,
      finishedAt: null,
      lastError: null,
      plannerRetryState: null,
    },
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
};

describe("runPlanningStateWithRetry", () => {
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

  it("retries planner failures and pauses for confirmation after the retry round is exhausted", async () => {
    const { TeamPlannerRetryConfirmationRequiredError, runPlanningStateWithRetry } =
      await import("@/lib/team/planner-retry");
    const advance = vi.fn(async () => {
      throw new Error("Codex CLI exited with status 1.");
    });

    await expect(
      runPlanningStateWithRetry({
        advance,
        currentState: createPlanningState(),
        delayMs: 0,
        env: {
          deps: {} as never,
          persistState: async () => undefined,
        },
        maxAttempts: 2,
        onTerminalError: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(TeamPlannerRetryConfirmationRequiredError);

    expect(advance).toHaveBeenCalledTimes(3);
    expect(thread.run).toMatchObject({
      status: "failed",
      lastError: "Codex CLI exited with status 1.",
      plannerRetryState: {
        attempts: 2,
        maxAttempts: 2,
        awaitingConfirmationSince: FIXED_TIMESTAMP,
        roleId: "planner",
      },
    });
  });
});

describe("confirmPlannerRetryRound", () => {
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

  it("resets planner retry attempts and advances the retry round after human confirmation", async () => {
    const planningState = createPlanningState();
    thread.run = {
      status: "failed",
      startedAt: FIXED_TIMESTAMP,
      finishedAt: FIXED_TIMESTAMP,
      lastError: "Codex CLI exited with status 1.",
      plannerRetryState: {
        roleId: "planner",
        roleName: "Planner",
        attempts: 10,
        maxAttempts: 10,
        round: 1,
        nextRetryAt: null,
        awaitingConfirmationSince: FIXED_TIMESTAMP,
        lastError: "Codex CLI exited with status 1.",
        updatedAt: FIXED_TIMESTAMP,
        resumeState: {
          stage: "planning",
          args: planningState.args,
          context: {
            threadId: planningState.context.threadId,
            worktree: planningState.context.worktree,
            selectedRepository: planningState.context.selectedRepository,
            shouldResetAssignment: planningState.context.shouldResetAssignment,
            state: planningState.context.state,
            requestMetadata: planningState.context.requestMetadata,
          },
        },
      },
    };

    const { confirmPlannerRetryRound } = await import("@/lib/team/planner-retry");
    const resumedState = await confirmPlannerRetryRound({
      threadId: "thread-1",
    });

    expect(thread.run).toMatchObject({
      status: "planning",
      lastError: null,
      plannerRetryState: {
        attempts: 0,
        round: 2,
        awaitingConfirmationSince: null,
        lastError: null,
      },
    });
    expect(resumedState).toMatchObject({
      stage: "planning",
      args: planningState.args,
    });
  });
});
