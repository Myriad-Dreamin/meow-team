import { rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  commitWorktreeChangesMock,
  detectBranchConflictMock,
  ensureLaneWorktreeMock,
  getBranchHeadMock,
  hasWorktreeChangesMock,
  inspectOpenSpecChangeArchiveStateMock,
  publishLaneBranchHeadMock,
  pushLaneBranchMock,
  synchronizePullRequestMock,
  tryRebaseWorktreeBranchMock,
} = vi.hoisted(() => ({
  commitWorktreeChangesMock: vi.fn(),
  detectBranchConflictMock: vi.fn(),
  ensureLaneWorktreeMock: vi.fn(),
  getBranchHeadMock: vi.fn(),
  hasWorktreeChangesMock: vi.fn(),
  inspectOpenSpecChangeArchiveStateMock: vi.fn(),
  publishLaneBranchHeadMock: vi.fn(),
  pushLaneBranchMock: vi.fn(),
  synchronizePullRequestMock: vi.fn(),
  tryRebaseWorktreeBranchMock: vi.fn(),
}));

vi.mock("@/team.config", () => ({
  teamConfig: {
    id: "test-team",
    name: "Test Team",
    owner: {
      name: "Owner",
      objective: "Ship reliable GitHub delivery.",
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
      threadFile: "/tmp/execute-mode-lane-test.sqlite",
    },
    dispatch: {
      workerCount: 1,
      maxProposalCount: 6,
      branchPrefix: "team-dispatch",
      baseBranch: "main",
      worktreeRoot: "/tmp/team-worktrees",
    },
    notifications: {
      target: "browser",
    },
    repositories: {
      roots: [],
    },
  },
}));

vi.mock("@/lib/git/ops", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/git/ops")>();
  return {
    ...actual,
    commitWorktreeChanges: commitWorktreeChangesMock,
    detectBranchConflict: detectBranchConflictMock,
    getBranchHead: getBranchHeadMock,
    hasWorktreeChanges: hasWorktreeChangesMock,
    inspectOpenSpecChangeArchiveState: inspectOpenSpecChangeArchiveStateMock,
    tryRebaseWorktreeBranch: tryRebaseWorktreeBranchMock,
  };
});

vi.mock("@/lib/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform")>();
  return {
    ...actual,
    synchronizePullRequest: synchronizePullRequestMock,
  };
});

vi.mock("@/lib/team/git", async () => {
  const actual = await vi.importActual<typeof import("@/lib/team/git")>("@/lib/team/git");
  return {
    ...actual,
    ensureLaneWorktree: ensureLaneWorktreeMock,
    publishLaneBranchHead: publishLaneBranchHeadMock,
    pushLaneBranch: pushLaneBranchMock,
  };
});

import { teamConfig } from "@/team.config";
import { ensurePendingDispatchWork, waitForLaneRunCompletion } from "@/lib/team/coding/reviewing";
import { createWorktree } from "@/lib/team/coding/worktree";
import { getTeamThreadRecord, type TeamThreadRecord } from "@/lib/team/history";
import {
  resetTeamThreadStorageStateCacheForTests,
  updateTeamThreadStorageRecord,
} from "@/lib/storage/thread";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import type { TeamRunEnv, TeamRunState } from "@/lib/team/coding/shared";
import type { TeamRoleDependencies } from "@/lib/team/roles/dependencies";
import type { TeamDispatchAssignment, TeamWorkerLaneRecord } from "@/lib/team/types";

const FIXED_TIMESTAMP = "2026-04-19T08:00:00.000Z";

const repository: TeamRepositoryOption = {
  id: "repo-1",
  name: "meow-team",
  rootId: "root",
  rootLabel: "Root",
  path: "/tmp/meow-team",
  relativePath: ".",
};

const createLane = ({
  executionMode,
}: {
  executionMode: TeamDispatchAssignment["executionMode"];
}): TeamWorkerLaneRecord => ({
  laneId: "lane-1",
  laneIndex: 1,
  status: "queued",
  executionPhase: "implementation",
  taskTitle: executionMode ? "Run execution lane" : "Implement standard lane",
  taskObjective: executionMode
    ? "Commit the execution script, validator, and summary artifact."
    : "Implement the approved code change.",
  proposalChangeName: "change-1",
  proposalPath: "openspec/changes/change-1",
  proposalCommitHash: "proposal-commit",
  workerSlot: 1,
  branchName: "requests/example/a1-proposal-1",
  baseBranch: "main",
  worktreePath: "/tmp/team-worktrees/meow-1",
  latestImplementationCommit: null,
  pushedCommit: null,
  latestCoderHandoff: null,
  latestReviewerHandoff: null,
  latestDecision: null,
  latestCoderSummary: null,
  latestReviewerSummary: null,
  latestActivity: "Queued for execution.",
  approvalRequestedAt: FIXED_TIMESTAMP,
  approvalGrantedAt: FIXED_TIMESTAMP,
  queuedAt: FIXED_TIMESTAMP,
  runCount: 0,
  revisionCount: 0,
  requeueReason: null,
  lastError: null,
  pullRequest: null,
  events: [],
  startedAt: FIXED_TIMESTAMP,
  finishedAt: null,
  updatedAt: FIXED_TIMESTAMP,
});

const createAssignment = ({
  executionMode,
}: {
  executionMode: TeamDispatchAssignment["executionMode"];
}): TeamDispatchAssignment => ({
  assignmentNumber: 1,
  status: "running",
  executionMode,
  repository,
  requestTitle: "Execute mode request",
  conventionalTitle: {
    type: "feat",
    scope: executionMode ? "team/executing" : "team/coding",
  },
  requestText: "Refresh fixtures",
  requestedAt: FIXED_TIMESTAMP,
  startedAt: FIXED_TIMESTAMP,
  finishedAt: null,
  updatedAt: FIXED_TIMESTAMP,
  plannerSummary: "Planner summary",
  plannerDeliverable: "Planner deliverable",
  branchPrefix: "execute-mode",
  canonicalBranchName: "requests/execute-mode/a1",
  baseBranch: "main",
  threadSlot: 1,
  plannerWorktreePath: "/tmp/team-worktrees/meow-1",
  workerCount: 1,
  lanes: [createLane({ executionMode })],
  plannerNotes: [],
  humanFeedback: [],
  supersededAt: null,
  supersededReason: null,
});

const createRunState = ({
  executionMode,
}: {
  executionMode: TeamDispatchAssignment["executionMode"];
}): TeamRunState => ({
  teamId: "test-team",
  teamName: "Test Team",
  ownerName: "Owner",
  objective: "Ship reliable GitHub delivery.",
  selectedRepository: repository,
  workflow: ["planner", "coder", "reviewer"],
  handoffs: {},
  handoffCounter: 0,
  assignmentNumber: 1,
  requestTitle: "Execute mode request",
  conventionalTitle: null,
  executionMode,
  requestText: "Refresh fixtures",
  threadWorktree: createWorktree({
    path: "/tmp/team-worktrees/meow-1",
    rootPath: "/tmp/team-worktrees",
  }),
  latestInput: executionMode ? `/${executionMode} Refresh fixtures` : "Refresh fixtures",
  forceReset: false,
});

const writeStoredThread = async ({
  executionMode,
  threadId,
  laneOverrides = {},
}: {
  executionMode: TeamDispatchAssignment["executionMode"];
  threadId: string;
  laneOverrides?: Partial<TeamWorkerLaneRecord>;
}) => {
  const assignment = createAssignment({ executionMode });
  assignment.lanes = [
    {
      ...assignment.lanes[0]!,
      ...laneOverrides,
    },
  ];

  const thread: TeamThreadRecord = {
    threadId,
    data: createRunState({ executionMode }),
    results: [],
    userMessages: [
      {
        id: `${threadId}-message`,
        role: "user",
        content: "Refresh fixtures",
        timestamp: FIXED_TIMESTAMP,
      },
    ],
    dispatchAssignments: [assignment],
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

  await updateTeamThreadStorageRecord({
    threadFile: teamConfig.storage.threadFile,
    threadId,
    updater: () => ({
      value: undefined,
      nextRecord: {
        threadId,
        payloadJson: JSON.stringify(thread),
        createdAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
      },
    }),
  });
};

const createEnv = ({
  coderAgent,
  reviewerAgent,
  executorAgent,
  executionReviewerAgent,
}: {
  coderAgent: Pick<TeamRoleDependencies["coderAgent"], "run">;
  reviewerAgent: Pick<TeamRoleDependencies["reviewerAgent"], "run">;
  executorAgent: Pick<TeamRoleDependencies["executorAgent"], "run">;
  executionReviewerAgent: Pick<TeamRoleDependencies["executionReviewerAgent"], "run">;
}): TeamRunEnv => ({
  deps: {
    executor: vi.fn() as unknown as TeamRoleDependencies["executor"],
    requestTitleAgent: { run: vi.fn() },
    plannerAgent: { run: vi.fn() },
    openSpecMaterializerAgent: { run: vi.fn() },
    coderAgent,
    reviewerAgent,
    executorAgent,
    executionReviewerAgent,
  },
  persistState: async () => undefined,
});

const configurePublishLaneBranchHeadMock = () => {
  publishLaneBranchHeadMock.mockReset();
  publishLaneBranchHeadMock.mockImplementation(
    async ({
      repositoryPath,
      branchName,
      commitHash,
      pushedCommit,
    }: {
      repositoryPath: string;
      branchName: string;
      commitHash: string;
      pushedCommit?: TeamWorkerLaneRecord["pushedCommit"];
    }) => {
      if (pushedCommit?.commitHash === commitHash) {
        return {
          published: false,
          pushedCommit,
        };
      }

      const pushedResult = await pushLaneBranchMock({
        repositoryPath,
        branchName,
        commitHash,
      });

      return {
        published: true,
        pushedCommit: {
          remoteName: pushedResult?.remoteName ?? "origin",
          repositoryUrl: pushedResult?.repositoryUrl ?? "https://example.com/repo.git",
          branchUrl: pushedResult?.branchUrl ?? `https://example.com/repo/tree/${branchName}`,
          commitUrl: pushedResult?.commitUrl ?? `https://example.com/repo/commit/${commitHash}`,
          commitHash,
          pushedAt: pushedResult?.pushedAt ?? FIXED_TIMESTAMP,
        },
      };
    },
  );
};

describe("execute-mode lane routing", () => {
  beforeEach(async () => {
    await resetTeamThreadStorageStateCacheForTests();
    getBranchHeadMock.mockReset();
    hasWorktreeChangesMock.mockReset();
    detectBranchConflictMock.mockReset();
    tryRebaseWorktreeBranchMock.mockReset();
    pushLaneBranchMock.mockReset();
    configurePublishLaneBranchHeadMock();
    synchronizePullRequestMock.mockReset();
    ensureLaneWorktreeMock.mockReset();
    commitWorktreeChangesMock.mockReset();
    inspectOpenSpecChangeArchiveStateMock.mockReset();

    ensureLaneWorktreeMock.mockResolvedValue(undefined);
    hasWorktreeChangesMock.mockResolvedValue(false);
    detectBranchConflictMock.mockResolvedValue(false);
    tryRebaseWorktreeBranchMock.mockResolvedValue({
      applied: true,
      error: null,
    });
    pushLaneBranchMock.mockResolvedValue({
      remoteName: "origin",
      repositoryUrl: "https://example.com/repo.git",
      branchUrl: "https://example.com/repo/tree/branch",
      commitUrl: "https://example.com/repo/commit/commit-after",
      commitHash: "commit-after",
      pushedAt: FIXED_TIMESTAMP,
    });
    synchronizePullRequestMock.mockResolvedValue({
      provider: "github",
      url: "https://example.com/pr/1",
    });
  });

  afterEach(async () => {
    await resetTeamThreadStorageStateCacheForTests();
    await rm(teamConfig.storage.threadFile, { force: true });
    await rm(`${teamConfig.storage.threadFile}-shm`, { force: true });
    await rm(`${teamConfig.storage.threadFile}-wal`, { force: true });
  });

  it("routes execute-mode lanes through executor and execution-reviewer roles", async () => {
    const threadId = "execute-thread";
    await writeStoredThread({
      executionMode: "execution",
      threadId,
    });
    getBranchHeadMock
      .mockResolvedValueOnce("commit-before")
      .mockResolvedValueOnce("commit-after")
      .mockResolvedValueOnce("commit-after");

    const coderAgent = { run: vi.fn() };
    const reviewerAgent = { run: vi.fn() };
    const executorAgent = {
      run: vi.fn(async () => ({
        summary: "Committed the execution artifacts.",
        deliverable: "Added the script, validator, and summary artifact.",
        decision: "continue" as const,
        pullRequestTitle: null,
        pullRequestSummary: null,
      })),
    };
    const executionReviewerAgent = {
      run: vi.fn(async () => ({
        summary: "Validated the execution artifacts.",
        deliverable: "Confirmed the validator command and summary artifact.",
        decision: "approved" as const,
        pullRequestTitle: "feat(team/executing): ready",
        pullRequestSummary: "Execution artifacts validated.",
      })),
    };

    const env = createEnv({
      coderAgent,
      reviewerAgent,
      executorAgent,
      executionReviewerAgent,
    });

    await ensurePendingDispatchWork(env, threadId);
    await waitForLaneRunCompletion(threadId, 1, "lane-1");

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(executorAgent.run).toHaveBeenCalledTimes(1);
    expect(executionReviewerAgent.run).toHaveBeenCalledTimes(1);
    expect(coderAgent.run).not.toHaveBeenCalled();
    expect(reviewerAgent.run).not.toHaveBeenCalled();
    expect(lane?.latestCoderSummary).toBe("Committed the execution artifacts.");
    expect(lane?.latestReviewerSummary).toBe("Validated the execution artifacts.");
    expect(lane?.latestImplementationCommit).toBe("commit-after");
    expect(lane?.pushedCommit?.commitHash).toBe("commit-after");
    expect(lane?.pullRequest?.status).toBe("awaiting_human_approval");
    expect(pushLaneBranchMock).toHaveBeenCalledTimes(1);
    expect(pushLaneBranchMock).toHaveBeenCalledWith({
      repositoryPath: "/tmp/team-worktrees/meow-1",
      branchName: "requests/example/a1-proposal-1",
      commitHash: "commit-after",
    });
  });

  it("publishes execution-reviewer feedback commits before requeueing execute-mode lanes", async () => {
    const threadId = "execute-feedback-thread";
    await writeStoredThread({
      executionMode: "execution",
      threadId,
    });
    getBranchHeadMock
      .mockResolvedValueOnce("commit-before")
      .mockResolvedValueOnce("commit-after")
      .mockResolvedValueOnce("review-feedback-commit");
    pushLaneBranchMock
      .mockResolvedValueOnce({
        remoteName: "origin",
        repositoryUrl: "https://example.com/repo.git",
        branchUrl: "https://example.com/repo/tree/branch",
        commitUrl: "https://example.com/repo/commit/commit-after",
        commitHash: "commit-after",
        pushedAt: FIXED_TIMESTAMP,
      })
      .mockResolvedValueOnce({
        remoteName: "origin",
        repositoryUrl: "https://example.com/repo.git",
        branchUrl: "https://example.com/repo/tree/branch",
        commitUrl: "https://example.com/repo/commit/review-feedback-commit",
        commitHash: "review-feedback-commit",
        pushedAt: FIXED_TIMESTAMP,
      });

    let secondExecutorStarted = false;
    let resolveSecondExecutor: (
      value: Awaited<ReturnType<TeamRoleDependencies["executorAgent"]["run"]>>,
    ) => void = () => undefined;
    const secondExecutorPromise = new Promise<
      Awaited<ReturnType<TeamRoleDependencies["executorAgent"]["run"]>>
    >((resolve) => {
      resolveSecondExecutor = resolve;
    });
    const env = createEnv({
      coderAgent: { run: vi.fn() },
      reviewerAgent: { run: vi.fn() },
      executorAgent: {
        run: vi
          .fn<TeamRoleDependencies["executorAgent"]["run"]>()
          .mockResolvedValueOnce({
            summary: "Committed the execution artifacts.",
            deliverable: "Added the script, validator, and summary artifact.",
            decision: "continue" as const,
            pullRequestTitle: null,
            pullRequestSummary: null,
          })
          .mockImplementationOnce(() => {
            secondExecutorStarted = true;
            return secondExecutorPromise;
          }),
      },
      executionReviewerAgent: {
        run: vi.fn(async () => ({
          summary: "Left a direct follow-up commit for the executor.",
          deliverable: "Address the execution-reviewer feedback commit.",
          decision: "needs_revision" as const,
          pullRequestTitle: null,
          pullRequestSummary: null,
        })),
      },
    });

    await ensurePendingDispatchWork(env, threadId);

    await vi.waitFor(async () => {
      expect(secondExecutorStarted).toBe(true);
      const updatedLane = (await getTeamThreadRecord(teamConfig.storage.threadFile, threadId))
        ?.dispatchAssignments[0]?.lanes[0];
      expect(updatedLane?.status).toBe("coding");
      expect(updatedLane?.requeueReason).toBe("reviewer_requested_changes");
      expect(updatedLane?.latestImplementationCommit).toBe("review-feedback-commit");
      expect(updatedLane?.pushedCommit?.commitHash).toBe("review-feedback-commit");
      expect(updatedLane?.latestActivity).toContain("addressing execution-reviewer feedback");
    });

    expect(pushLaneBranchMock).toHaveBeenNthCalledWith(1, {
      repositoryPath: "/tmp/team-worktrees/meow-1",
      branchName: "requests/example/a1-proposal-1",
      commitHash: "commit-after",
    });
    expect(pushLaneBranchMock).toHaveBeenNthCalledWith(2, {
      repositoryPath: "/tmp/team-worktrees/meow-1",
      branchName: "requests/example/a1-proposal-1",
      commitHash: "review-feedback-commit",
    });
    expect(synchronizePullRequestMock).not.toHaveBeenCalled();

    resolveSecondExecutor({
      summary: "Working on the execution-reviewer feedback.",
      deliverable: "No new execution artifacts yet.",
      decision: "continue",
      pullRequestTitle: null,
      pullRequestSummary: null,
    });
    await waitForLaneRunCompletion(threadId, 1, "lane-1");
  });

  it("publishes an execute-mode reviewing lane head when pushed metadata is missing", async () => {
    const threadId = "execute-review-retry-missing-push";
    const persistedExecutorHandoff = {
      roleId: "executor",
      roleName: "Executor",
      summary: "Committed the execution artifacts.",
      deliverable: "Execution artifacts are ready for validation.",
      decision: "continue" as const,
      sequence: 1,
      assignmentNumber: 1,
      updatedAt: FIXED_TIMESTAMP,
    };
    await writeStoredThread({
      executionMode: "execution",
      threadId,
      laneOverrides: {
        status: "reviewing",
        latestImplementationCommit: "commit-after",
        pushedCommit: null,
        latestCoderHandoff: persistedExecutorHandoff,
        latestCoderSummary: persistedExecutorHandoff.summary,
        latestDecision: persistedExecutorHandoff.decision,
        latestActivity:
          "Execution reviewer is retrying after the previous validation attempt failed.",
      },
    });
    getBranchHeadMock.mockResolvedValueOnce("commit-after");
    pushLaneBranchMock.mockResolvedValueOnce({
      remoteName: "origin",
      repositoryUrl: "https://example.com/repo.git",
      branchUrl: "https://example.com/repo/tree/branch",
      commitUrl: "https://example.com/repo/commit/commit-after",
      commitHash: "commit-after",
      pushedAt: FIXED_TIMESTAMP,
    });

    let secondExecutorStarted = false;
    let resolveSecondExecutor: (
      value: Awaited<ReturnType<TeamRoleDependencies["executorAgent"]["run"]>>,
    ) => void = () => undefined;
    const secondExecutorPromise = new Promise<
      Awaited<ReturnType<TeamRoleDependencies["executorAgent"]["run"]>>
    >((resolve) => {
      resolveSecondExecutor = resolve;
    });
    const env = createEnv({
      coderAgent: { run: vi.fn() },
      reviewerAgent: { run: vi.fn() },
      executorAgent: {
        run: vi.fn(() => {
          secondExecutorStarted = true;
          return secondExecutorPromise;
        }),
      },
      executionReviewerAgent: {
        run: vi.fn(async () => ({
          summary: "Retry execution reviewer requested changes.",
          deliverable: "Address the retried execution-review feedback.",
          decision: "needs_revision" as const,
          pullRequestTitle: null,
          pullRequestSummary: null,
        })),
      },
    });

    await ensurePendingDispatchWork(env, threadId);

    await vi.waitFor(async () => {
      expect(secondExecutorStarted).toBe(true);
      const updatedLane = (await getTeamThreadRecord(teamConfig.storage.threadFile, threadId))
        ?.dispatchAssignments[0]?.lanes[0];
      expect(updatedLane?.status).toBe("coding");
      expect(updatedLane?.requeueReason).toBe("reviewer_requested_changes");
      expect(updatedLane?.latestImplementationCommit).toBe("commit-after");
      expect(updatedLane?.pushedCommit?.commitHash).toBe("commit-after");
      expect(updatedLane?.latestActivity).toContain("addressing execution-reviewer feedback");
    });

    expect(env.deps.executionReviewerAgent.run).toHaveBeenCalledTimes(1);
    expect(pushLaneBranchMock).toHaveBeenCalledTimes(1);
    expect(pushLaneBranchMock).toHaveBeenCalledWith({
      repositoryPath: "/tmp/team-worktrees/meow-1",
      branchName: "requests/example/a1-proposal-1",
      commitHash: "commit-after",
    });

    resolveSecondExecutor({
      summary: "Working on the retried execution-reviewer feedback.",
      deliverable: "No new execution artifacts yet.",
      decision: "continue",
      pullRequestTitle: null,
      pullRequestSummary: null,
    });
    await waitForLaneRunCompletion(threadId, 1, "lane-1");
  });

  it("keeps unprefixed lanes on the existing coder and reviewer path", async () => {
    const threadId = "default-thread";
    await writeStoredThread({
      executionMode: null,
      threadId,
    });
    getBranchHeadMock
      .mockResolvedValueOnce("commit-before")
      .mockResolvedValueOnce("commit-after")
      .mockResolvedValueOnce("commit-after");

    const coderAgent = {
      run: vi.fn(async () => ({
        summary: "Implemented the standard lane.",
        deliverable: "Applied the requested code change.",
        decision: "continue" as const,
        pullRequestTitle: null,
        pullRequestSummary: null,
      })),
    };
    const reviewerAgent = {
      run: vi.fn(async () => ({
        summary: "Reviewed the standard lane.",
        deliverable: "Validation passed.",
        decision: "approved" as const,
        pullRequestTitle: "feat(team/coding): ready",
        pullRequestSummary: "Code review passed.",
      })),
    };
    const executorAgent = { run: vi.fn() };
    const executionReviewerAgent = { run: vi.fn() };

    const env = createEnv({
      coderAgent,
      reviewerAgent,
      executorAgent,
      executionReviewerAgent,
    });

    await ensurePendingDispatchWork(env, threadId);
    await waitForLaneRunCompletion(threadId, 1, "lane-1");

    expect(coderAgent.run).toHaveBeenCalledTimes(1);
    expect(reviewerAgent.run).toHaveBeenCalledTimes(1);
    expect(executorAgent.run).not.toHaveBeenCalled();
    expect(executionReviewerAgent.run).not.toHaveBeenCalled();
  });
});
