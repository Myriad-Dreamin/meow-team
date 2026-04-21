import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  commitContainsPathMock,
  commitWorktreeChangesMock,
  detectBranchConflictMock,
  deleteManagedBranchesMock,
  ensureBranchRefMock,
  ensureLaneWorktreeMock,
  findCommitContainingPathInReflogMock,
  findConfiguredRepositoryMock,
  getBranchHeadMock,
  hasWorktreeChangesMock,
  inspectOpenSpecChangeArchiveStateMock,
  listExistingBranchesMock,
  materializeAssignmentProposalsMock,
  publishLaneBranchHeadMock,
  pushLaneBranchMock,
  resolveRepositoryBaseBranchMock,
  synchronizePullRequestMock,
  tryRebaseWorktreeBranchMock,
} = vi.hoisted(() => {
  return {
    commitContainsPathMock: vi.fn(),
    commitWorktreeChangesMock: vi.fn(),
    detectBranchConflictMock: vi.fn(),
    deleteManagedBranchesMock: vi.fn(),
    ensureBranchRefMock: vi.fn(),
    ensureLaneWorktreeMock: vi.fn(),
    findCommitContainingPathInReflogMock: vi.fn(),
    findConfiguredRepositoryMock: vi.fn(),
    getBranchHeadMock: vi.fn(),
    hasWorktreeChangesMock: vi.fn(),
    inspectOpenSpecChangeArchiveStateMock: vi.fn(),
    listExistingBranchesMock: vi.fn(),
    materializeAssignmentProposalsMock: vi.fn(),
    publishLaneBranchHeadMock: vi.fn(),
    pushLaneBranchMock: vi.fn(),
    resolveRepositoryBaseBranchMock: vi.fn(),
    synchronizePullRequestMock: vi.fn(),
    tryRebaseWorktreeBranchMock: vi.fn(),
  };
});

vi.mock("@/lib/git/ops", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/git/ops")>();
  return {
    ...actual,
    commitContainsPath: commitContainsPathMock,
    commitWorktreeChanges: commitWorktreeChangesMock,
    detectBranchConflict: detectBranchConflictMock,
    ensureBranchRef: ensureBranchRefMock,
    findCommitContainingPathInReflog: findCommitContainingPathInReflogMock,
    getBranchHead: getBranchHeadMock,
    hasWorktreeChanges: hasWorktreeChangesMock,
    inspectOpenSpecChangeArchiveState: inspectOpenSpecChangeArchiveStateMock,
    listExistingBranches: listExistingBranchesMock,
    resolveRepositoryBaseBranch: resolveRepositoryBaseBranchMock,
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
    deleteManagedBranches: deleteManagedBranchesMock,
    ensureLaneWorktree: ensureLaneWorktreeMock,
    publishLaneBranchHead: publishLaneBranchHeadMock,
    pushLaneBranch: pushLaneBranchMock,
  };
});

vi.mock("@/lib/team/openspec", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/team/openspec")>();
  return {
    ...actual,
    materializeAssignmentProposals: materializeAssignmentProposalsMock,
  };
});

vi.mock("@/lib/team/repositories", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/team/repositories")>();
  return {
    ...actual,
    findConfiguredRepository: findConfiguredRepositoryMock,
  };
});

import { teamConfig } from "@/team.config";
import { buildCanonicalBranchName, buildLaneBranchName } from "@/lib/team/git";
import * as historyModule from "@/lib/team/history";
import {
  getTeamThreadRecord,
  type PendingDispatchAssignment,
  type TeamThreadRecord,
  upsertTeamThreadRun,
} from "@/lib/team/history";
import {
  assignPendingDispatchThreadSlots,
  assignPendingDispatchWorkerSlots,
  createWorktree,
  createInitialTeamRunState,
  createTeamRunEnv,
  persistTeamRunState,
  prepareAssignmentReplan,
  runTeam,
  TeamThreadReplanError,
  type TeamRunEnv,
} from "@/lib/team/coding";
import { approveLanePullRequest } from "@/lib/team/coding/archiving";
import { approveLaneProposal } from "@/lib/team/coding/coding";
import { createPlannerDispatchAssignment } from "@/lib/team/coding/plan";
import { ensurePendingDispatchWork, waitForLaneRunCompletion } from "@/lib/team/coding/reviewing";
import {
  resetTeamThreadStorageStateCacheForTests,
  updateTeamThreadStorageRecord,
} from "@/lib/storage/thread";
import type { TeamRepositoryOption } from "@/lib/git/repository";
import type { TeamRoleDependencies } from "@/lib/team/roles/dependencies";
import type { TeamDispatchAssignment, TeamWorkerLaneRecord } from "@/lib/team/types";

type RequestTitleAgentArgs = Parameters<TeamRoleDependencies["requestTitleAgent"]["run"]>;
type PlannerAgentArgs = Parameters<TeamRoleDependencies["plannerAgent"]["run"]>;
type PlannerAgentResult = Awaited<ReturnType<TeamRoleDependencies["plannerAgent"]["run"]>>;
const FIXED_TIMESTAMP = "2026-04-11T08:00:00.000Z";

const repository: TeamRepositoryOption = {
  id: "repo-1",
  name: "meow-team",
  rootId: "root-1",
  rootLabel: "Workspace",
  path: process.cwd(),
  relativePath: ".",
};

const dispatchRepository: TeamRepositoryOption = {
  id: "repo-dispatch",
  name: "Repository",
  rootId: "root-dispatch",
  rootLabel: "Root",
  path: "/tmp/repository",
  relativePath: ".",
};

const createTestWorktree = (worktreePath: string) => createWorktree({ path: worktreePath });
const createManagedPlanningWorktree = (repositoryPath: string, slot = 1) => {
  const rootPath = path.isAbsolute(teamConfig.dispatch.worktreeRoot)
    ? teamConfig.dispatch.worktreeRoot
    : path.join(repositoryPath, teamConfig.dispatch.worktreeRoot);
  return createWorktree({
    path: `${rootPath}/meow-${slot}`,
    rootPath,
  });
};

const createPersistStateMock = () => vi.fn<TeamRunEnv["persistState"]>(async () => undefined);

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
          repositoryUrl: pushedResult?.repositoryUrl ?? "https://github.com/example/meow-team",
          branchUrl:
            pushedResult?.branchUrl ?? `https://github.com/example/meow-team/tree/${branchName}`,
          commitUrl:
            pushedResult?.commitUrl ?? `https://github.com/example/meow-team/commit/${commitHash}`,
          commitHash,
          pushedAt: pushedResult?.pushedAt ?? FIXED_TIMESTAMP,
        },
      };
    },
  );
};

const createReplayLane = (overrides: Partial<TeamWorkerLaneRecord> = {}): TeamWorkerLaneRecord => ({
  laneId: "lane-1",
  laneIndex: 1,
  status: "awaiting_human_approval",
  executionPhase: null,
  taskTitle: "Replay task",
  taskObjective: "Replay the persisted stage safely.",
  proposalChangeName: "replay-change",
  proposalPath: "openspec/changes/replay-change",
  proposalCommitHash: null,
  finalizationMode: null,
  proposalDisposition: "active",
  finalizationCheckpoint: null,
  workerSlot: null,
  branchName: "requests/replay/a1-proposal-1",
  baseBranch: "main",
  worktreePath: null,
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
  runCount: 0,
  revisionCount: 0,
  requeueReason: null,
  lastError: null,
  pullRequest: null,
  events: [],
  startedAt: null,
  finishedAt: null,
  updatedAt: FIXED_TIMESTAMP,
  ...overrides,
});

const createReplayAssignment = (
  lane: TeamWorkerLaneRecord,
  overrides: Partial<TeamDispatchAssignment> = {},
): TeamDispatchAssignment => ({
  assignmentNumber: 1,
  status: "awaiting_human_approval",
  repository,
  requestTitle: "Replay Request",
  conventionalTitle: null,
  requestText: "Replay the persisted stage.",
  requestedAt: FIXED_TIMESTAMP,
  startedAt: FIXED_TIMESTAMP,
  finishedAt: null,
  updatedAt: FIXED_TIMESTAMP,
  plannerSummary: "Replay summary",
  plannerDeliverable: "Replay deliverable",
  branchPrefix: "replay",
  canonicalBranchName: "requests/replay/a1",
  baseBranch: "main",
  threadSlot: 1,
  plannerWorktreePath: "/tmp/worktrees/meow-1",
  workerCount: 1,
  lanes: [lane],
  plannerNotes: [],
  humanFeedback: [],
  supersededAt: null,
  supersededReason: null,
  ...overrides,
});

const writeStoredThreadRecord = async (
  thread: Omit<TeamThreadRecord, "archivedAt"> & { archivedAt?: TeamThreadRecord["archivedAt"] },
): Promise<void> => {
  await updateTeamThreadStorageRecord({
    threadFile: teamConfig.storage.threadFile,
    threadId: thread.threadId,
    updater: () => ({
      value: undefined,
      nextRecord: {
        threadId: thread.threadId,
        payloadJson: JSON.stringify({
          archivedAt: null,
          ...thread,
        }),
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      },
    }),
  });
};

const writeReplayThreadStore = async ({
  threadId,
  assignmentNumber = 1,
  lane,
  assignmentOverrides = {},
}: {
  threadId: string;
  assignmentNumber?: number;
  lane: TeamWorkerLaneRecord;
  assignmentOverrides?: Partial<TeamDispatchAssignment>;
}) => {
  await writeStoredThreadRecord({
    threadId,
    data: {
      teamId: teamConfig.id,
      teamName: teamConfig.name,
      ownerName: teamConfig.owner.name,
      objective: teamConfig.owner.objective,
      selectedRepository: repository,
      workflow: [...teamConfig.workflow],
      handoffs: {},
      handoffCounter: 0,
      assignmentNumber,
      requestTitle: assignmentOverrides.requestTitle ?? "Replay Request",
      conventionalTitle: assignmentOverrides.conventionalTitle ?? null,
      requestText: assignmentOverrides.requestText ?? "Replay the persisted stage.",
      threadWorktree: null,
      latestInput: assignmentOverrides.requestText ?? "Replay the persisted stage.",
      forceReset: false,
    },
    results: [],
    userMessages: [],
    dispatchAssignments: [
      createReplayAssignment(lane, {
        assignmentNumber,
        ...assignmentOverrides,
      }),
    ],
    run: {
      status: "running",
      startedAt: FIXED_TIMESTAMP,
      finishedAt: null,
      lastError: null,
    },
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  });
};

describe.sequential("runTeam", () => {
  let originalThreadFile: string;
  let originalWorkerCount: number;
  let tempDirectory: string;

  beforeEach(async () => {
    originalThreadFile = teamConfig.storage.threadFile;
    originalWorkerCount = teamConfig.dispatch.workerCount;
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), "run-team-"));
    teamConfig.storage.threadFile = path.join(tempDirectory, "threads.sqlite");

    findConfiguredRepositoryMock.mockReset();
    findConfiguredRepositoryMock.mockResolvedValue(null);
    deleteManagedBranchesMock.mockReset();
    deleteManagedBranchesMock.mockResolvedValue(undefined);
    listExistingBranchesMock.mockReset();
    listExistingBranchesMock.mockResolvedValue([]);
    materializeAssignmentProposalsMock.mockReset();
    materializeAssignmentProposalsMock.mockResolvedValue(undefined);
    resolveRepositoryBaseBranchMock.mockReset();
    resolveRepositoryBaseBranchMock.mockResolvedValue("main");
    pushLaneBranchMock.mockReset();
    pushLaneBranchMock.mockResolvedValue({
      branchName: "requests/example/a1-proposal-1",
      commitHash: "proposal-commit",
      commitUrl: "https://github.com/example/meow-team/commit/proposal-commit",
      remoteName: "origin",
    });
    configurePublishLaneBranchHeadMock();
    synchronizePullRequestMock.mockReset();
    synchronizePullRequestMock.mockResolvedValue({
      url: "https://github.com/example/meow-team/pull/42",
    });
    commitContainsPathMock.mockReset();
    commitContainsPathMock.mockResolvedValue(true);
    ensureBranchRefMock.mockReset();
    ensureBranchRefMock.mockResolvedValue(undefined);
    getBranchHeadMock.mockReset();
    getBranchHeadMock.mockResolvedValue("proposal-commit");
    ensureLaneWorktreeMock.mockReset();
    ensureLaneWorktreeMock.mockResolvedValue(undefined);
    findCommitContainingPathInReflogMock.mockReset();
    findCommitContainingPathInReflogMock.mockResolvedValue(null);
    tryRebaseWorktreeBranchMock.mockReset();
    tryRebaseWorktreeBranchMock.mockResolvedValue({
      applied: true,
      error: null,
    });
    hasWorktreeChangesMock.mockReset();
    hasWorktreeChangesMock.mockResolvedValue(false);
    detectBranchConflictMock.mockReset();
    detectBranchConflictMock.mockResolvedValue(false);
    commitWorktreeChangesMock.mockReset();
    commitWorktreeChangesMock.mockResolvedValue(undefined);
    inspectOpenSpecChangeArchiveStateMock.mockReset();
    inspectOpenSpecChangeArchiveStateMock.mockResolvedValue({
      sourcePath: "openspec/changes/change-1",
      sourceExists: false,
      archivedPath: "openspec/changes/archive/2026-04-11-change-1",
    });
  });

  afterEach(async () => {
    await resetTeamThreadStorageStateCacheForTests();
    teamConfig.storage.threadFile = originalThreadFile;
    teamConfig.dispatch.workerCount = originalWorkerCount;
    await rm(tempDirectory, {
      force: true,
      recursive: true,
    });
  });

  it("uses injected request-title and planner roles and forwards dependencies into dispatch scheduling", async () => {
    findConfiguredRepositoryMock.mockResolvedValue(repository);
    const callOrder: string[] = [];
    ensureLaneWorktreeMock.mockImplementation(async () => {
      callOrder.push("prepare");
    });

    const executorMock = vi.fn(async () => {
      throw new Error("executor should not be called");
    });
    const executor = executorMock as unknown as TeamRoleDependencies["executor"];

    const requestTitleAgentMock = {
      run: vi.fn(async (input: RequestTitleAgentArgs[0]) => {
        callOrder.push(input.tasks?.length ? "request-title:metadata" : "request-title:initial");

        if (!input.tasks?.length) {
          expect(input).toMatchObject({
            input: "Ship reliable dispatch coordination.",
            requestText: "Ship reliable dispatch coordination.",
            worktree: createManagedPlanningWorktree(repository.path),
            tasks: null,
          });

          return {
            title: "Dispatch Coordination",
            conventionalTitle: null,
          };
        }

        expect(input).toMatchObject({
          input: "Ship reliable dispatch coordination.",
          requestText: "Ship reliable dispatch coordination.",
          worktree: createManagedPlanningWorktree(repository.path),
          tasks: [
            {
              title: "Stabilize dispatch flow",
              objective: "Inject role dependencies into the scheduler.",
            },
          ],
        });

        return {
          title: "stabilize dispatch flow",
          conventionalTitle: {
            type: "dev" as const,
            scope: "dispatch/coordination",
          },
        };
      }),
    };
    const plannerAgentMock = {
      run: vi.fn(async (input: PlannerAgentArgs[0]): Promise<PlannerAgentResult> => {
        callOrder.push("planner");
        expect(input.worktree).toEqual(createManagedPlanningWorktree(repository.path));
        expect(input.state.requestTitle).toBe("Dispatch Coordination");
        expect(input.state.conventionalTitle).toBeNull();
        expect(input.state.selectedRepository).toEqual(repository);

        const response = {
          handoff: {
            summary: "Planner summary",
            deliverable: "Planner deliverable",
            decision: "continue" as const,
          },
          dispatch: {
            planSummary: "Plan summary",
            plannerDeliverable: "Plan deliverable",
            branchPrefix: "dispatch-coordination",
            tasks: [
              {
                title: "Stabilize dispatch flow",
                objective: "Inject role dependencies into the scheduler.",
              },
            ],
          },
        } satisfies PlannerAgentResult;

        return response;
      }),
    };
    const coderAgentMock = { run: vi.fn() };
    const reviewerAgentMock = { run: vi.fn() };
    const persistStateMock = createPersistStateMock();
    const env = createTeamRunEnv({
      dependencies: {
        executor,
        requestTitleAgent: requestTitleAgentMock,
        plannerAgent: plannerAgentMock,
        coderAgent: coderAgentMock,
        reviewerAgent: reviewerAgentMock,
      },
      persistState: persistStateMock,
    });
    const initialState = createInitialTeamRunState({
      kind: "planning",
      input: "Ship reliable dispatch coordination.",
      repositoryId: repository.id,
      threadId: "thread-1",
    });
    await persistTeamRunState(env, initialState);
    const result = await runTeam(env, initialState);

    expect(callOrder).toEqual([
      "prepare",
      "request-title:initial",
      "planner",
      "request-title:metadata",
    ]);
    expect(executorMock).not.toHaveBeenCalled();
    expect(ensureLaneWorktreeMock).toHaveBeenCalledTimes(1);
    expect(ensureLaneWorktreeMock).toHaveBeenNthCalledWith(1, {
      repositoryPath: repository.path,
      worktreeRoot: path.join(repository.path, teamConfig.dispatch.worktreeRoot),
      worktreePath: createManagedPlanningWorktree(repository.path).path,
      branchName: "main",
      startPoint: "main",
    });
    expect(requestTitleAgentMock.run).toHaveBeenCalledTimes(2);
    expect(plannerAgentMock.run).toHaveBeenCalledTimes(1);
    expect(coderAgentMock.run).not.toHaveBeenCalled();
    expect(reviewerAgentMock.run).not.toHaveBeenCalled();
    expect(materializeAssignmentProposalsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryPath: repository.path,
        requestTitle: "dev(dispatch/coordination): stabilize dispatch flow",
        conventionalTitle: {
          type: "dev",
          scope: "dispatch/coordination",
        },
        requestInput: "Ship reliable dispatch coordination.",
        plannerSummary: "Plan summary",
        plannerDeliverable: "Plan deliverable",
        canonicalBranchName: expect.stringMatching(/^requests\/dispatch-coordination\//),
      }),
    );
    expect(persistStateMock.mock.calls.map(([state]) => state.stage)).toEqual([
      "init",
      "planning",
      "metadata-generation",
      "reviewing",
      "completed",
    ]);
    expect(result).not.toBeNull();
    if (!result) {
      throw new Error("Expected a planning summary.");
    }
    expect(result.requestTitle).toBe("dev(dispatch/coordination): stabilize dispatch flow");
    expect(result.requestText).toBe("Ship reliable dispatch coordination.");
    expect(result.repository).toEqual(repository);
    expect(result.handoffs).toHaveLength(1);
    expect(result.handoffs[0]).toMatchObject({
      roleId: "planner",
      summary: "Planner summary",
      deliverable: "Planner deliverable",
      decision: "continue",
    });
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({
      agentName: "Planner",
      text: "Planner deliverable",
    });

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-1");
    expect(thread?.data.requestTitle).toBe("dev(dispatch/coordination): stabilize dispatch flow");
    expect(thread?.data.conventionalTitle).toEqual({
      type: "dev",
      scope: "dispatch/coordination",
    });
    expect(thread?.data.requestText).toBe("Ship reliable dispatch coordination.");
    expect(thread?.data.handoffs.planner?.summary).toBe("Planner summary");
    expect(thread?.data.threadWorktree).toEqual(createManagedPlanningWorktree(repository.path));
    expect(thread?.results).toHaveLength(1);
  });

  it("regenerates conventional metadata after planning even if the initial title pass returns one", async () => {
    findConfiguredRepositoryMock.mockResolvedValue(repository);
    const callOrder: string[] = [];

    const executorMock = vi.fn(async () => {
      throw new Error("executor should not be called");
    });
    const executor = executorMock as unknown as TeamRoleDependencies["executor"];

    const requestTitleAgentMock = {
      run: vi.fn(async (input: RequestTitleAgentArgs[0]) => {
        callOrder.push(input.tasks?.length ? "request-title:metadata" : "request-title:initial");

        if (!input.tasks?.length) {
          return {
            title: "Dispatch Coordination",
            conventionalTitle: {
              type: "fix" as const,
              scope: "stale/scope",
            },
          };
        }

        expect(input.tasks).toEqual([
          {
            title: "Stabilize dispatch flow",
            objective: "Inject role dependencies into the scheduler.",
          },
        ]);

        return {
          title: "stabilize dispatch flow",
          conventionalTitle: {
            type: "dev" as const,
            scope: "dispatch/coordination",
          },
        };
      }),
    };
    const plannerAgentMock = {
      run: vi.fn(async (input: PlannerAgentArgs[0]): Promise<PlannerAgentResult> => {
        callOrder.push("planner");
        expect(input.worktree).toEqual(createManagedPlanningWorktree(repository.path));
        expect(input.state.requestTitle).toBe("Dispatch Coordination");
        expect(input.state.conventionalTitle).toBeNull();
        expect(input.state.selectedRepository).toEqual(repository);

        return {
          handoff: {
            summary: "Planner summary",
            deliverable: "Planner deliverable",
            decision: "continue" as const,
          },
          dispatch: {
            planSummary: "Plan summary",
            plannerDeliverable: "Plan deliverable",
            branchPrefix: "dispatch-coordination",
            tasks: [
              {
                title: "Stabilize dispatch flow",
                objective: "Inject role dependencies into the scheduler.",
              },
            ],
          },
        };
      }),
    };
    const persistStateMock = createPersistStateMock();
    const env = createTeamRunEnv({
      dependencies: {
        executor,
        requestTitleAgent: requestTitleAgentMock,
        plannerAgent: plannerAgentMock,
      },
      persistState: persistStateMock,
    });
    const initialState = createInitialTeamRunState({
      kind: "planning",
      input: "Ship reliable dispatch coordination.",
      repositoryId: repository.id,
      threadId: "thread-stale-conventional-title",
    });
    await persistTeamRunState(env, initialState);
    const result = await runTeam(env, initialState);

    expect(callOrder).toEqual(["request-title:initial", "planner", "request-title:metadata"]);
    expect(requestTitleAgentMock.run).toHaveBeenCalledTimes(2);
    expect(plannerAgentMock.run).toHaveBeenCalledTimes(1);
    expect(materializeAssignmentProposalsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryPath: repository.path,
        requestTitle: "dev(dispatch/coordination): stabilize dispatch flow",
        conventionalTitle: {
          type: "dev",
          scope: "dispatch/coordination",
        },
      }),
    );
    expect(persistStateMock.mock.calls.map(([state]) => state.stage)).toEqual([
      "init",
      "planning",
      "metadata-generation",
      "reviewing",
      "completed",
    ]);
    expect(result?.requestTitle).toBe("dev(dispatch/coordination): stabilize dispatch flow");

    const thread = await getTeamThreadRecord(
      teamConfig.storage.threadFile,
      "thread-stale-conventional-title",
    );
    expect(thread?.data.requestTitle).toBe("dev(dispatch/coordination): stabilize dispatch flow");
    expect(thread?.data.conventionalTitle).toEqual({
      type: "dev",
      scope: "dispatch/coordination",
    });
  });

  it("reuses a provided title and skips request-title generation when dispatch is blocked", async () => {
    const executorMock = vi.fn(async () => {
      throw new Error("executor should not be called");
    });
    const executor = executorMock as unknown as TeamRoleDependencies["executor"];

    const requestTitleAgentMock = { run: vi.fn() };
    const plannerAgentMock = {
      run: vi.fn(async (input: PlannerAgentArgs[0]): Promise<PlannerAgentResult> => {
        expect(input.worktree).toEqual(createTestWorktree(process.cwd()));
        expect(input.state.requestTitle).toBe("Human Title");
        expect(input.state.conventionalTitle).toBeNull();
        expect(input.state.selectedRepository).toBeNull();

        const response = {
          handoff: {
            summary: "Planner is waiting for a repository",
            deliverable: "Select a repository before proposal dispatch can continue.",
            decision: "continue" as const,
          },
          dispatch: null,
        } satisfies PlannerAgentResult;

        return response;
      }),
    };
    const coderAgentMock = { run: vi.fn() };
    const reviewerAgentMock = { run: vi.fn() };
    const persistStateMock = createPersistStateMock();
    const env = createTeamRunEnv({
      dependencies: {
        executor,
        requestTitleAgent: requestTitleAgentMock,
        plannerAgent: plannerAgentMock,
        coderAgent: coderAgentMock,
        reviewerAgent: reviewerAgentMock,
      },
      persistState: persistStateMock,
    });
    const initialState = createInitialTeamRunState({
      kind: "planning",
      input: "Plan the request.",
      title: "Human Title",
      threadId: "thread-2",
    });
    await persistTeamRunState(env, initialState);
    const result = await runTeam(env, initialState);

    expect(requestTitleAgentMock.run).not.toHaveBeenCalled();
    expect(plannerAgentMock.run).toHaveBeenCalledTimes(1);
    expect(executorMock).not.toHaveBeenCalled();
    expect(materializeAssignmentProposalsMock).not.toHaveBeenCalled();
    expect(persistStateMock.mock.calls.map(([state]) => state.stage)).toEqual([
      "init",
      "planning",
      "metadata-generation",
      "completed",
    ]);
    expect(result).not.toBeNull();
    if (!result) {
      throw new Error("Expected a planning summary.");
    }
    expect(result.requestTitle).toBe("Human Title");
    expect(result.repository).toBeNull();
    expect(result.handoffs[0]).toMatchObject({
      roleId: "planner",
      summary: "Planner is waiting for a repository",
      decision: "continue",
    });

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-2");
    expect(thread?.data.requestTitle).toBe("Human Title");
    expect(thread?.data.handoffs.planner?.summary).toBe("Planner is waiting for a repository");
  });

  it("reuses a persisted title before planning and skips regeneration when the request is unchanged", async () => {
    await upsertTeamThreadRun({
      threadFile: teamConfig.storage.threadFile,
      threadId: "thread-persisted-title",
      state: {
        teamId: teamConfig.id,
        teamName: teamConfig.name,
        ownerName: teamConfig.owner.name,
        objective: teamConfig.owner.objective,
        selectedRepository: null,
        workflow: [...teamConfig.workflow],
        handoffs: {},
        handoffCounter: 0,
        assignmentNumber: 1,
        requestTitle: "Persisted Title",
        conventionalTitle: null,
        requestText: "Plan the persisted request.",
        threadWorktree: null,
        latestInput: "Plan the persisted request.",
        forceReset: false,
      },
      input: "Plan the persisted request.",
    });

    const requestTitleAgentMock = { run: vi.fn() };
    const plannerAgentMock = {
      run: vi.fn(async (input: PlannerAgentArgs[0]): Promise<PlannerAgentResult> => {
        expect(input.worktree).toEqual(createTestWorktree(process.cwd()));
        expect(input.state.requestTitle).toBe("Persisted Title");
        expect(input.state.conventionalTitle).toBeNull();
        expect(input.state.requestText).toBe("Plan the persisted request.");

        return {
          handoff: {
            summary: "Planner is waiting for a repository",
            deliverable: "Select a repository before proposal dispatch can continue.",
            decision: "continue" as const,
          },
          dispatch: null,
        };
      }),
    };
    const env = createTeamRunEnv({
      dependencies: {
        requestTitleAgent: requestTitleAgentMock,
        plannerAgent: plannerAgentMock,
      },
      persistState: createPersistStateMock(),
    });
    const initialState = createInitialTeamRunState({
      kind: "planning",
      input: "Plan the persisted request.",
      threadId: "thread-persisted-title",
    });
    const result = await runTeam(env, initialState);

    expect(requestTitleAgentMock.run).not.toHaveBeenCalled();
    expect(plannerAgentMock.run).toHaveBeenCalledTimes(1);
    expect(result?.requestTitle).toBe("Persisted Title");

    const thread = await getTeamThreadRecord(
      teamConfig.storage.threadFile,
      "thread-persisted-title",
    );
    expect(thread?.data.requestTitle).toBe("Persisted Title");
  });

  it("generates a plain request title before planning when dispatch stays blocked", async () => {
    const executorMock = vi.fn(async () => {
      throw new Error("executor should not be called");
    });
    const executor = executorMock as unknown as TeamRoleDependencies["executor"];

    const requestTitleAgentMock = {
      run: vi.fn(async (input: RequestTitleAgentArgs[0]) => {
        expect(input).toMatchObject({
          input: "Plan the request.",
          requestText: "Plan the request.",
          worktree: createTestWorktree(process.cwd()),
          tasks: null,
        });

        return {
          title: "Planning Request",
          conventionalTitle: null,
        };
      }),
    };
    const plannerAgentMock = {
      run: vi.fn(async (input: PlannerAgentArgs[0]): Promise<PlannerAgentResult> => {
        expect(input.worktree).toEqual(createTestWorktree(process.cwd()));
        expect(input.state.requestTitle).toBe("Planning Request");
        expect(input.state.conventionalTitle).toBeNull();
        expect(input.state.selectedRepository).toBeNull();

        return {
          handoff: {
            summary: "Planner is waiting for a repository",
            deliverable: "Select a repository before proposal dispatch can continue.",
            decision: "continue" as const,
          },
          dispatch: null,
        };
      }),
    };
    const persistStateMock = createPersistStateMock();
    const env = createTeamRunEnv({
      dependencies: {
        executor,
        requestTitleAgent: requestTitleAgentMock,
        plannerAgent: plannerAgentMock,
      },
      persistState: persistStateMock,
    });
    const initialState = createInitialTeamRunState({
      kind: "planning",
      input: "Plan the request.",
      threadId: "thread-3",
    });
    await persistTeamRunState(env, initialState);
    const result = await runTeam(env, initialState);

    expect(requestTitleAgentMock.run).toHaveBeenCalledTimes(1);
    expect(plannerAgentMock.run).toHaveBeenCalledTimes(1);
    expect(materializeAssignmentProposalsMock).not.toHaveBeenCalled();
    expect(persistStateMock.mock.calls.map(([state]) => state.stage)).toEqual([
      "init",
      "planning",
      "metadata-generation",
      "completed",
    ]);
    expect(result).not.toBeNull();
    if (!result) {
      throw new Error("Expected a planning summary.");
    }
    expect(result.requestTitle).toBe("Planning Request");

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-3");
    expect(thread?.data.requestTitle).toBe("Planning Request");
    expect(thread?.data.conventionalTitle).toBeNull();
  });

  it("does not replay metadata-generation side effects when resuming the same persisted stage", async () => {
    ensureLaneWorktreeMock.mockImplementation(async () => undefined);
    const requestTitleAgentMock = {
      run: vi.fn(async () => {
        return {
          title: "stabilize dispatch flow",
          conventionalTitle: {
            type: "dev" as const,
            scope: "dispatch/coordination",
          },
        };
      }),
    };
    const persistStateMock = createPersistStateMock();
    const env = createTeamRunEnv({
      dependencies: {
        requestTitleAgent: requestTitleAgentMock,
      },
      persistState: persistStateMock,
    });
    const plannerHandoff = {
      roleId: "planner",
      roleName: "Planner",
      summary: "Planner summary",
      deliverable: "Planner deliverable",
      decision: "continue" as const,
      sequence: 1,
      assignmentNumber: 1,
      updatedAt: FIXED_TIMESTAMP,
    };
    const stageState = {
      teamId: teamConfig.id,
      teamName: teamConfig.name,
      ownerName: teamConfig.owner.name,
      objective: teamConfig.owner.objective,
      selectedRepository: repository,
      workflow: [...teamConfig.workflow],
      handoffs: {
        planner: plannerHandoff,
      },
      handoffCounter: 1,
      assignmentNumber: 1,
      requestTitle: "Dispatch Coordination",
      conventionalTitle: null,
      requestText: "Ship reliable dispatch coordination.",
      threadWorktree: null,
      latestInput: "Ship reliable dispatch coordination.",
      forceReset: false,
    };

    await upsertTeamThreadRun({
      threadFile: teamConfig.storage.threadFile,
      threadId: "thread-replay",
      state: {
        ...stageState,
        handoffs: {},
        handoffCounter: 0,
      },
      input: "Ship reliable dispatch coordination.",
    });

    const persistedStage = {
      stage: "metadata-generation",
      args: {
        kind: "planning",
        input: "Ship reliable dispatch coordination.",
        repositoryId: repository.id,
        threadId: "thread-replay",
      },
      context: {
        threadId: "thread-replay",
        worktree: createManagedPlanningWorktree(repository.path),
        selectedRepository: repository,
        existingThread: null,
        shouldResetAssignment: true,
        state: stageState,
        requestMetadata: {
          requestTitle: "Dispatch Coordination",
          conventionalTitle: null,
          requestText: "Ship reliable dispatch coordination.",
        },
      },
      plannerResponse: {
        handoff: {
          summary: "Planner summary",
          deliverable: "Planner deliverable",
          decision: "continue" as const,
        },
        dispatch: {
          planSummary: "Plan summary",
          plannerDeliverable: "Plan deliverable",
          branchPrefix: "dispatch-coordination",
          tasks: [
            {
              title: "Stabilize dispatch flow",
              objective: "Inject role dependencies into the scheduler.",
            },
          ],
        },
      },
      plannerRoleName: "Planner",
    } satisfies Parameters<typeof runTeam>[1];

    await runTeam(env, structuredClone(persistedStage));
    await runTeam(env, structuredClone(persistedStage));

    expect(ensureLaneWorktreeMock).not.toHaveBeenCalled();
    expect(requestTitleAgentMock.run).toHaveBeenCalledTimes(1);
    expect(materializeAssignmentProposalsMock).toHaveBeenCalledTimes(1);

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-replay");
    expect(thread?.dispatchAssignments).toHaveLength(1);
    expect(thread?.results).toHaveLength(1);
    expect(thread?.data.requestTitle).toBe("dev(dispatch/coordination): stabilize dispatch flow");
    expect(thread?.data.threadWorktree).toEqual(createManagedPlanningWorktree(repository.path));
  });

  it("fails fast when all shared meow slots are already assigned to active threads", async () => {
    teamConfig.dispatch.workerCount = 1;
    findConfiguredRepositoryMock.mockResolvedValue(repository);

    await writeStoredThreadRecord({
      threadId: "active-thread",
      data: {
        teamId: teamConfig.id,
        teamName: teamConfig.name,
        ownerName: teamConfig.owner.name,
        objective: teamConfig.owner.objective,
        selectedRepository: repository,
        workflow: ["planner", "coder", "reviewer"],
        handoffs: {},
        handoffCounter: 0,
        assignmentNumber: 1,
        requestTitle: "Existing request",
        conventionalTitle: null,
        requestText: "Keep the current slot busy.",
        threadWorktree: null,
        latestInput: "Keep the current slot busy.",
        forceReset: false,
      },
      results: [],
      userMessages: [],
      dispatchAssignments: [
        {
          assignmentNumber: 1,
          status: "running",
          repository,
          requestTitle: "Existing request",
          conventionalTitle: null,
          requestText: "Keep the current slot busy.",
          requestedAt: FIXED_TIMESTAMP,
          startedAt: FIXED_TIMESTAMP,
          finishedAt: null,
          updatedAt: FIXED_TIMESTAMP,
          plannerSummary: "Existing summary",
          plannerDeliverable: "Existing deliverable",
          branchPrefix: "existing",
          canonicalBranchName: "requests/existing/a1",
          baseBranch: "main",
          threadSlot: 1,
          plannerWorktreePath: "/tmp/worktrees/meow-1",
          workerCount: 1,
          lanes: [
            {
              laneId: "lane-1",
              laneIndex: 1,
              status: "awaiting_human_approval",
              executionPhase: null,
              taskTitle: "Existing task",
              taskObjective: "Hold the shared slot.",
              proposalChangeName: "existing-change",
              proposalPath: "openspec/changes/existing-change",
              workerSlot: null,
              branchName: "requests/existing/a1-proposal-1",
              baseBranch: "main",
              worktreePath: null,
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
              runCount: 0,
              revisionCount: 0,
              requeueReason: null,
              lastError: null,
              pullRequest: null,
              events: [],
              startedAt: null,
              finishedAt: null,
              updatedAt: FIXED_TIMESTAMP,
            },
          ],
          plannerNotes: [],
          humanFeedback: [],
          supersededAt: null,
          supersededReason: null,
        },
      ],
      run: {
        status: "running",
        startedAt: FIXED_TIMESTAMP,
        finishedAt: null,
        lastError: null,
      },
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    });

    const requestTitleAgentMock = { run: vi.fn() };
    const plannerAgentMock = { run: vi.fn() };
    const persistStateMock = createPersistStateMock();
    const env = createTeamRunEnv({
      dependencies: {
        requestTitleAgent: requestTitleAgentMock,
        plannerAgent: plannerAgentMock,
      },
      persistState: persistStateMock,
    });
    const initialState = createInitialTeamRunState({
      kind: "planning",
      input: "Start another request.",
      repositoryId: repository.id,
      threadId: "thread-over-capacity",
    });
    await persistTeamRunState(env, initialState);

    await expect(runTeam(env, initialState)).rejects.toThrow(
      "All 1 shared meow worktree slot is already claimed by living repository-backed threads.",
    );

    expect(requestTitleAgentMock.run).not.toHaveBeenCalled();
    expect(plannerAgentMock.run).not.toHaveBeenCalled();
    expect(materializeAssignmentProposalsMock).not.toHaveBeenCalled();
    expect(persistStateMock.mock.calls.map(([state]) => state.stage)).toEqual(["init"]);
  });

  it("blocks new repository-backed planning while a completed thread still owns its meow worktree", async () => {
    teamConfig.dispatch.workerCount = 1;
    findConfiguredRepositoryMock.mockResolvedValue(repository);
    const claimedWorktree = createManagedPlanningWorktree(repository.path);

    await writeStoredThreadRecord({
      threadId: "completed-thread",
      data: {
        teamId: teamConfig.id,
        teamName: teamConfig.name,
        ownerName: teamConfig.owner.name,
        objective: teamConfig.owner.objective,
        selectedRepository: repository,
        workflow: ["planner", "coder", "reviewer"],
        handoffs: {},
        handoffCounter: 0,
        assignmentNumber: 1,
        requestTitle: "Completed request",
        conventionalTitle: null,
        requestText: "Hold the claimed meow worktree until archive.",
        threadWorktree: null,
        latestInput: "Hold the claimed meow worktree until archive.",
        forceReset: false,
      },
      results: [],
      userMessages: [],
      dispatchAssignments: [
        {
          assignmentNumber: 1,
          status: "completed",
          repository,
          requestTitle: "Completed request",
          conventionalTitle: null,
          requestText: "Hold the claimed meow worktree until archive.",
          requestedAt: FIXED_TIMESTAMP,
          startedAt: FIXED_TIMESTAMP,
          finishedAt: FIXED_TIMESTAMP,
          updatedAt: FIXED_TIMESTAMP,
          plannerSummary: "Completed summary",
          plannerDeliverable: "Completed deliverable",
          branchPrefix: "completed",
          canonicalBranchName: "requests/completed/a1",
          baseBranch: "main",
          threadSlot: claimedWorktree.slot,
          plannerWorktreePath: claimedWorktree.path,
          workerCount: 1,
          lanes: [
            {
              laneId: "lane-1",
              laneIndex: 1,
              status: "approved",
              executionPhase: null,
              taskTitle: "Completed task",
              taskObjective: "Keep the thread-scoped worktree claimed until archive.",
              proposalChangeName: "completed-change",
              proposalPath: "openspec/changes/archive/2026-04-11-completed-change",
              workerSlot: null,
              branchName: "requests/completed/a1-proposal-1",
              baseBranch: "main",
              worktreePath: claimedWorktree.path,
              latestImplementationCommit: "completed-commit",
              pushedCommit: null,
              latestCoderHandoff: null,
              latestReviewerHandoff: null,
              latestDecision: "approved",
              latestCoderSummary: null,
              latestReviewerSummary: "Machine review approved the branch.",
              latestActivity: "Completed and awaiting archive.",
              approvalRequestedAt: FIXED_TIMESTAMP,
              approvalGrantedAt: FIXED_TIMESTAMP,
              queuedAt: FIXED_TIMESTAMP,
              runCount: 1,
              revisionCount: 0,
              requeueReason: null,
              lastError: null,
              pullRequest: {
                id: "pr-completed",
                provider: "github",
                title: "Completed request",
                summary: "Machine review approved the branch.",
                branchName: "requests/completed/a1-proposal-1",
                baseBranch: "main",
                status: "approved",
                requestedAt: FIXED_TIMESTAMP,
                humanApprovalRequestedAt: FIXED_TIMESTAMP,
                humanApprovedAt: FIXED_TIMESTAMP,
                machineReviewedAt: FIXED_TIMESTAMP,
                updatedAt: FIXED_TIMESTAMP,
                url: "https://github.com/example/meow-team/pull/100",
              },
              events: [],
              startedAt: FIXED_TIMESTAMP,
              finishedAt: FIXED_TIMESTAMP,
              updatedAt: FIXED_TIMESTAMP,
            },
          ],
          plannerNotes: [],
          humanFeedback: [],
          supersededAt: null,
          supersededReason: null,
        },
      ],
      run: {
        status: "completed",
        startedAt: FIXED_TIMESTAMP,
        finishedAt: FIXED_TIMESTAMP,
        lastError: null,
      },
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    });

    const env = createTeamRunEnv({
      dependencies: {
        requestTitleAgent: { run: vi.fn() },
        plannerAgent: { run: vi.fn() },
      },
      persistState: createPersistStateMock(),
    });
    const initialState = createInitialTeamRunState({
      kind: "planning",
      input: "Start another request.",
      repositoryId: repository.id,
      threadId: "thread-over-capacity-completed",
    });

    await expect(runTeam(env, initialState)).rejects.toThrow(
      "All 1 shared meow worktree slot is already claimed by living repository-backed threads.",
    );
  });

  it("rejects a concurrent second planning run before it can reuse the same claimed meow worktree", async () => {
    teamConfig.dispatch.workerCount = 1;
    findConfiguredRepositoryMock.mockResolvedValue(repository);

    let releaseFirstRequestTitle: (() => void) | null = null;
    let signalFirstRequestTitleStarted: (() => void) | null = null;
    const firstRequestTitleStarted = new Promise<void>((resolve) => {
      signalFirstRequestTitleStarted = resolve;
    });
    const requestTitleAgentMock = {
      run: vi.fn(async (input: RequestTitleAgentArgs[0]) => {
        if (!input.tasks?.length && input.input === "Plan thread one.") {
          signalFirstRequestTitleStarted?.();
          signalFirstRequestTitleStarted = null;
          await new Promise<void>((resolve) => {
            releaseFirstRequestTitle = resolve;
          });
        }

        return {
          title: input.input === "Plan thread two." ? "Thread Two" : "Thread One",
          conventionalTitle: null,
        };
      }),
    };
    const plannerAgentMock = {
      run: vi.fn(async (input: PlannerAgentArgs[0]): Promise<PlannerAgentResult> => {
        expect(input.worktree).toEqual(createManagedPlanningWorktree(repository.path));
        return {
          handoff: {
            summary: "Planner summary",
            deliverable: "Planner deliverable",
            decision: "continue" as const,
          },
          dispatch: {
            planSummary: "Plan summary",
            plannerDeliverable: "Plan deliverable",
            branchPrefix: "thread-one",
            tasks: [
              {
                title: "Use the claimed worktree",
                objective: "Keep the meow slot exclusive while planning is in flight.",
              },
            ],
          },
        };
      }),
    };
    const env = createTeamRunEnv({
      dependencies: {
        requestTitleAgent: requestTitleAgentMock,
        plannerAgent: plannerAgentMock,
      },
      persistState: createPersistStateMock(),
    });

    const firstRun = runTeam(
      env,
      createInitialTeamRunState({
        kind: "planning",
        input: "Plan thread one.",
        repositoryId: repository.id,
        threadId: "thread-one",
      }),
    );
    await firstRequestTitleStarted;

    const claimedThread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-one");
    expect(claimedThread?.data.threadWorktree).toEqual(
      createManagedPlanningWorktree(repository.path),
    );
    expect(plannerAgentMock.run).not.toHaveBeenCalled();

    await expect(
      runTeam(
        env,
        createInitialTeamRunState({
          kind: "planning",
          input: "Plan thread two.",
          repositoryId: repository.id,
          threadId: "thread-two",
        }),
      ),
    ).rejects.toThrow(
      "All 1 shared meow worktree slot is already claimed by living repository-backed threads.",
    );
    expect(requestTitleAgentMock.run).toHaveBeenCalledTimes(1);

    const releaseBlockedRequestTitle =
      releaseFirstRequestTitle ??
      (() => {
        throw new Error("The first request-title run never blocked as expected.");
      });
    releaseBlockedRequestTitle();

    const result = await firstRun;
    expect(result?.threadId).toBe("thread-one");

    const secondThread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-two");
    expect(secondThread).toBeNull();
  });

  it("reuses a legacy claimed meow worktree when replanning the same thread", async () => {
    teamConfig.dispatch.workerCount = 1;
    findConfiguredRepositoryMock.mockResolvedValue(repository);
    const claimedWorktree = createManagedPlanningWorktree(repository.path);

    await writeStoredThreadRecord({
      threadId: "thread-replan-legacy-worktree",
      data: {
        teamId: teamConfig.id,
        teamName: teamConfig.name,
        ownerName: teamConfig.owner.name,
        objective: teamConfig.owner.objective,
        selectedRepository: repository,
        workflow: [...teamConfig.workflow],
        handoffs: {},
        handoffCounter: 0,
        assignmentNumber: 1,
        requestTitle: "Legacy request",
        conventionalTitle: null,
        requestText: "Reuse the previously claimed meow worktree.",
        threadWorktree: null,
        latestInput: "Reuse the previously claimed meow worktree.",
        forceReset: false,
      },
      results: [],
      userMessages: [],
      dispatchAssignments: [
        createDispatchAssignment({
          assignmentNumber: 1,
          repository,
          status: "failed",
          threadSlot: claimedWorktree.slot,
          plannerWorktreePath: claimedWorktree.path,
          lanes: [
            createDispatchLane({
              laneId: "lane-1",
              laneIndex: 1,
              status: "failed",
              worktreePath: claimedWorktree.path,
              lastError: "Legacy failure.",
              finishedAt: FIXED_TIMESTAMP,
            }),
          ],
        }),
      ],
      run: {
        status: "failed",
        startedAt: FIXED_TIMESTAMP,
        finishedAt: FIXED_TIMESTAMP,
        lastError: "Legacy failure.",
      },
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
    });

    const requestTitleAgentMock = {
      run: vi.fn(async (input: RequestTitleAgentArgs[0]) => {
        expect(input.worktree).toEqual(claimedWorktree);
        return {
          title: "Legacy request",
          conventionalTitle: null,
        };
      }),
    };
    const plannerAgentMock = {
      run: vi.fn(async (input: PlannerAgentArgs[0]): Promise<PlannerAgentResult> => {
        expect(input.worktree).toEqual(claimedWorktree);
        return {
          handoff: {
            summary: "Planner summary",
            deliverable: "Planner deliverable",
            decision: "continue" as const,
          },
          dispatch: {
            planSummary: "Plan summary",
            plannerDeliverable: "Plan deliverable",
            branchPrefix: "legacy-replan",
            tasks: [
              {
                title: "Replan task",
                objective: "Reuse the claimed meow worktree.",
              },
            ],
          },
        };
      }),
    };

    const env = createTeamRunEnv({
      dependencies: {
        requestTitleAgent: requestTitleAgentMock,
        plannerAgent: plannerAgentMock,
      },
      persistState: createPersistStateMock(),
    });

    await runTeam(
      env,
      createInitialTeamRunState({
        kind: "planning",
        input: "Use the same meow worktree again.",
        repositoryId: repository.id,
        threadId: "thread-replan-legacy-worktree",
      }),
    );

    const thread = await getTeamThreadRecord(
      teamConfig.storage.threadFile,
      "thread-replan-legacy-worktree",
    );

    expect(thread?.data.threadWorktree).toEqual(claimedWorktree);
    expect(materializeAssignmentProposalsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        plannerWorktreePath: claimedWorktree.path,
      }),
    );
  });

  it("does not replay coding-stage queueing when resuming the same persisted stage", async () => {
    getBranchHeadMock.mockReset();
    getBranchHeadMock
      .mockResolvedValueOnce("proposal-commit")
      .mockResolvedValueOnce("review-commit")
      .mockResolvedValueOnce("rebased-review-commit");
    pushLaneBranchMock.mockReset();
    configurePublishLaneBranchHeadMock();
    pushLaneBranchMock.mockResolvedValue({
      ...basePushedCommit,
      commitHash: "rebased-review-commit",
      commitUrl: "https://github.com/example/meow-team/commit/rebased-review-commit",
    });
    synchronizePullRequestMock.mockReset();
    synchronizePullRequestMock.mockResolvedValue({
      url: "https://github.com/example/meow-team/pull/42",
    });
    const persistStateMock = createPersistStateMock();
    const env = createTeamRunEnv({
      dependencies: {
        executor: vi.fn() as TeamRoleDependencies["executor"],
        requestTitleAgent: { run: vi.fn() },
        plannerAgent: { run: vi.fn() },
        coderAgent: {
          run: vi.fn(async () => ({
            summary: "Implemented the approved proposal.",
            deliverable: "Implementation is ready for machine review.",
            decision: "continue" as const,
            pullRequestTitle: null,
            pullRequestSummary: null,
          })),
        },
        reviewerAgent: {
          run: vi.fn(async () => ({
            summary: "Machine review approved the branch.",
            deliverable: "Implementation looks correct.",
            decision: "approved" as const,
            pullRequestTitle: "Replay Queueing",
            pullRequestSummary: "Machine review approved the branch.",
          })),
        },
      },
      persistState: persistStateMock,
    });

    await writeReplayThreadStore({
      threadId: "thread-coding-replay",
      assignmentNumber: 2,
      lane: createReplayLane({
        laneId: "lane-3",
        status: "queued",
        approvalGrantedAt: FIXED_TIMESTAMP,
        queuedAt: FIXED_TIMESTAMP,
        branchName: "requests/replay/a2-proposal-1",
      }),
      assignmentOverrides: {
        assignmentNumber: 2,
        canonicalBranchName: "requests/replay/a2",
        requestTitle: "Replay Queueing",
        requestText: "Queue the lane once.",
      },
    });

    const persistedStage = {
      stage: "coding",
      args: {
        kind: "proposal-approval",
        threadId: "thread-coding-replay",
        assignmentNumber: 2,
        laneId: "lane-3",
      },
      worktree: createWorktree({
        path: "/tmp/worktrees/meow-1",
        rootPath: "/tmp/worktrees",
      }),
    } satisfies Parameters<typeof runTeam>[1];

    await runTeam(env, structuredClone(persistedStage));
    await runTeam(env, structuredClone(persistedStage));
    await waitForLaneRunCompletion("thread-coding-replay", 2, "lane-3");

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-coding-replay");
    expect(thread?.dispatchAssignments[0]?.lanes[0]?.status).toBe("approved");
    expect(persistStateMock.mock.calls.map(([state]) => state.stage)).toEqual([
      "reviewing",
      "completed",
      "reviewing",
      "completed",
    ]);
  });

  it("routes proposal approval through coding and reviewing stages", async () => {
    getBranchHeadMock.mockReset();
    getBranchHeadMock
      .mockResolvedValueOnce("proposal-commit")
      .mockResolvedValueOnce("proposal-commit")
      .mockResolvedValueOnce("review-commit")
      .mockResolvedValueOnce("rebased-review-commit");
    pushLaneBranchMock.mockReset();
    configurePublishLaneBranchHeadMock();
    pushLaneBranchMock
      .mockResolvedValueOnce({
        ...basePushedCommit,
        commitHash: "proposal-commit",
        commitUrl: "https://github.com/example/meow-team/commit/proposal-commit",
      })
      .mockResolvedValueOnce({
        ...basePushedCommit,
        commitHash: "review-commit",
        commitUrl: "https://github.com/example/meow-team/commit/review-commit",
      })
      .mockResolvedValueOnce({
        ...basePushedCommit,
        commitHash: "rebased-review-commit",
        commitUrl: "https://github.com/example/meow-team/commit/rebased-review-commit",
      });
    synchronizePullRequestMock.mockReset();
    synchronizePullRequestMock
      .mockResolvedValueOnce({
        url: "https://github.com/example/meow-team/pull/42",
      })
      .mockResolvedValueOnce({
        url: "https://github.com/example/meow-team/pull/42",
      });

    const persistStateMock = createPersistStateMock();
    const env = createTeamRunEnv({
      dependencies: {
        executor: vi.fn() as TeamRoleDependencies["executor"],
        requestTitleAgent: { run: vi.fn() },
        plannerAgent: { run: vi.fn() },
        coderAgent: {
          run: vi.fn(async () => ({
            summary: "Implemented the approved proposal.",
            deliverable: "Implementation is ready for machine review.",
            decision: "continue" as const,
            pullRequestTitle: null,
            pullRequestSummary: null,
          })),
        },
        reviewerAgent: {
          run: vi.fn(async () => ({
            summary: "Machine review approved the branch.",
            deliverable: "Implementation looks correct.",
            decision: "approved" as const,
            pullRequestTitle: "Ship the feature",
            pullRequestSummary: "Machine review approved the branch.",
          })),
        },
      },
      persistState: persistStateMock,
    });
    await writeStoredThreadRecord(
      createDispatchThreadRecord({
        threadId: "thread-approval",
        assignment: createDispatchAssignment({
          assignmentNumber: 2,
          repository: dispatchRepository,
          status: "awaiting_human_approval",
          requestTitle: "Ship the feature",
          requestText: "Implement the approved proposal.",
          plannerSummary: "Planner summary",
          branchPrefix: "example",
          canonicalBranchName: "requests/example/a2",
          workerCount: 1,
          threadSlot: 1,
          plannerWorktreePath: `${path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot)}/meow-1`,
          lanes: [
            createDispatchLane({
              laneId: "lane-3",
              laneIndex: 1,
              status: "awaiting_human_approval",
              branchName: "requests/example/a2-proposal-1",
              baseBranch: "main",
              taskTitle: "Ship the feature",
              taskObjective: "Implement the approved proposal.",
              proposalChangeName: "change-1",
              proposalPath: "openspec/changes/change-1",
              approvalRequestedAt: FIXED_TIMESTAMP,
              queuedAt: null,
            }),
          ],
        }),
        runStatus: "awaiting_human_approval",
      }),
    );
    const initialState = createInitialTeamRunState({
      kind: "proposal-approval",
      threadId: "thread-approval",
      assignmentNumber: 2,
      laneId: "lane-3",
    });
    await persistTeamRunState(env, initialState);

    const result = await runTeam(env, initialState);
    await waitForLaneRunCompletion("thread-approval", 2, "lane-3");

    expect(result).toBeNull();
    expect(persistStateMock.mock.calls.map(([state]) => state.stage)).toEqual([
      "init",
      "coding",
      "reviewing",
      "completed",
    ]);

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-approval");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];
    expect(lane?.approvalGrantedAt).toBeTruthy();
    expect(lane?.pullRequest).not.toBeNull();
    expect(lane?.status).toBe("approved");
    expect(lane?.worktreePath).toBe(
      `${path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot)}/meow-1`,
    );
  });

  it("routes final approval through the archiving stage", async () => {
    getBranchHeadMock.mockReset();
    getBranchHeadMock.mockResolvedValue("archive-commit");
    inspectOpenSpecChangeArchiveStateMock.mockReset();
    inspectOpenSpecChangeArchiveStateMock.mockResolvedValue({
      sourcePath: "openspec/changes/change-1",
      sourceExists: false,
      archivedPath: "openspec/changes/archive/2026-04-11-change-1",
    });

    const persistStateMock = createPersistStateMock();
    const env = createTeamRunEnv({
      dependencies: {
        executor: vi.fn() as TeamRoleDependencies["executor"],
        requestTitleAgent: { run: vi.fn() },
        plannerAgent: { run: vi.fn() },
        coderAgent: {
          run: vi.fn(async () => ({
            summary: "Archived the approved OpenSpec change.",
            deliverable: "Final archive pass completed.",
            decision: "continue" as const,
            pullRequestTitle: null,
            pullRequestSummary: null,
          })),
        },
        reviewerAgent: { run: vi.fn() },
      },
      persistState: persistStateMock,
    });
    await writeStoredThreadRecord(
      createDispatchThreadRecord({
        threadId: "thread-finalize",
        assignment: createDispatchAssignment({
          assignmentNumber: 4,
          repository: dispatchRepository,
          status: "approved",
          requestTitle: "Ship the feature",
          requestText: "Finalize the reviewed branch.",
          branchPrefix: "example",
          canonicalBranchName: "requests/example/a4",
          workerCount: 1,
          lanes: [
            createDispatchLane({
              laneId: "lane-2",
              laneIndex: 1,
              status: "approved",
              branchName: "requests/example/a4-proposal-1",
              baseBranch: "main",
              taskTitle: "Ship the feature",
              taskObjective: "Archive the approved proposal and open a GitHub PR.",
              proposalChangeName: "change-1",
              proposalPath: "openspec/changes/archive/2026-04-11-change-1",
              worktreePath: `${path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot)}/meow-1`,
              latestImplementationCommit: "review-commit",
              pushedCommit: {
                ...basePushedCommit,
                branchUrl:
                  "https://github.com/example/meow-team/tree/requests/example/a4-proposal-1",
                commitHash: "review-commit",
                commitUrl: "https://github.com/example/meow-team/commit/review-commit",
              },
              latestDecision: "approved",
              latestReviewerSummary: "Machine review approved the branch.",
              latestActivity: "Waiting for final human approval.",
              approvalRequestedAt: FIXED_TIMESTAMP,
              approvalGrantedAt: FIXED_TIMESTAMP,
              queuedAt: FIXED_TIMESTAMP,
              runCount: 1,
              pullRequest: {
                id: "pr-1",
                provider: "github",
                title: "Ship the feature",
                summary: "Machine review approved the branch.",
                branchName: "requests/example/a4-proposal-1",
                baseBranch: "main",
                status: "awaiting_human_approval",
                requestedAt: FIXED_TIMESTAMP,
                humanApprovalRequestedAt: FIXED_TIMESTAMP,
                humanApprovedAt: null,
                machineReviewedAt: FIXED_TIMESTAMP,
                updatedAt: FIXED_TIMESTAMP,
                url: "https://github.com/example/meow-team/pull/42",
              },
            }),
          ],
        }),
        runStatus: "approved",
      }),
    );
    const initialState = createInitialTeamRunState({
      kind: "pull-request-approval",
      threadId: "thread-finalize",
      assignmentNumber: 4,
      laneId: "lane-2",
      finalizationMode: "archive",
    });
    await persistTeamRunState(env, initialState);

    const result = await runTeam(env, initialState);

    expect(result).toBeNull();
    expect(persistStateMock.mock.calls.map(([state]) => state.stage)).toEqual([
      "init",
      "archiving",
      "completed",
    ]);

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-finalize");
    expect(thread?.dispatchAssignments[0]?.lanes[0]?.pullRequest?.status).toBe("approved");
  });

  it("does not replay archiving once the pull request is already finalized", async () => {
    const persistStateMock = createPersistStateMock();
    const env = createTeamRunEnv({
      persistState: persistStateMock,
    });

    await writeReplayThreadStore({
      threadId: "thread-archiving-replay",
      assignmentNumber: 4,
      lane: createReplayLane({
        laneId: "lane-2",
        status: "approved",
        latestDecision: "approved",
        latestReviewerSummary: "Machine review approved the branch.",
        approvalGrantedAt: FIXED_TIMESTAMP,
        queuedAt: FIXED_TIMESTAMP,
        branchName: "requests/replay/a4-proposal-1",
        pullRequest: {
          id: "pr-1",
          provider: "github",
          title: "Replay Queueing",
          summary: "Machine review approved the branch.",
          branchName: "requests/replay/a4-proposal-1",
          baseBranch: "main",
          status: "approved",
          requestedAt: FIXED_TIMESTAMP,
          humanApprovalRequestedAt: FIXED_TIMESTAMP,
          humanApprovedAt: FIXED_TIMESTAMP,
          machineReviewedAt: FIXED_TIMESTAMP,
          updatedAt: FIXED_TIMESTAMP,
          url: "https://github.com/example/meow-team/pull/42",
        },
      }),
      assignmentOverrides: {
        assignmentNumber: 4,
        status: "approved",
        canonicalBranchName: "requests/replay/a4",
        requestTitle: "Replay Queueing",
        requestText: "Finalize once.",
      },
    });

    const persistedStage = {
      stage: "archiving",
      args: {
        kind: "pull-request-approval",
        threadId: "thread-archiving-replay",
        assignmentNumber: 4,
        laneId: "lane-2",
        finalizationMode: "archive",
      },
      worktree: createWorktree({
        path: "/tmp/worktrees/meow-1",
        rootPath: "/tmp/worktrees",
      }),
    } satisfies Parameters<typeof runTeam>[1];

    await runTeam(env, structuredClone(persistedStage));
    await runTeam(env, structuredClone(persistedStage));

    const thread = await getTeamThreadRecord(
      teamConfig.storage.threadFile,
      "thread-archiving-replay",
    );
    expect(thread?.dispatchAssignments[0]?.lanes[0]?.pullRequest?.status).toBe("approved");
  });

  it("resumes pending dispatch work through the reviewing stage", async () => {
    const persistStateMock = createPersistStateMock();
    const env = createTeamRunEnv({
      persistState: persistStateMock,
    });
    const initialState = createInitialTeamRunState({
      kind: "dispatch",
      threadId: "thread-dispatch",
    });
    await persistTeamRunState(env, initialState);

    const result = await runTeam(env, initialState);

    expect(result).toBeNull();
    expect(persistStateMock.mock.calls.map(([state]) => state.stage)).toEqual([
      "init",
      "reviewing",
      "completed",
    ]);
  });
});

const createDispatchLane = ({
  laneId,
  laneIndex,
  status,
  workerSlot = null,
  worktreePath = null,
  queuedAt = FIXED_TIMESTAMP,
  branchName = `requests/test/a1-proposal-${laneIndex}`,
  baseBranch = "main",
  taskTitle = `Task ${laneIndex}`,
  taskObjective = `Objective ${laneIndex}`,
  proposalChangeName = `change-${laneId}`,
  proposalPath = `openspec/changes/change-${laneId}`,
  proposalCommitHash = null,
  finalizationMode = null,
  proposalDisposition = proposalPath.startsWith("openspec/changes/archive/")
    ? "archived"
    : "active",
  finalizationCheckpoint = null,
  latestImplementationCommit = null,
  pushedCommit = null,
  latestDecision = null,
  latestCoderSummary = null,
  latestReviewerSummary = null,
  latestActivity = null,
  approvalRequestedAt = null,
  approvalGrantedAt = null,
  runCount = 0,
  revisionCount = 0,
  requeueReason = null,
  lastError = null,
  pullRequest = null,
  events = [],
  startedAt = null,
  finishedAt = null,
}: {
  laneId: string;
  laneIndex: number;
  status: TeamWorkerLaneRecord["status"];
  workerSlot?: number | null;
  worktreePath?: string | null;
  queuedAt?: string | null;
  branchName?: string;
  baseBranch?: string;
  taskTitle?: string;
  taskObjective?: string;
  proposalChangeName?: string;
  proposalPath?: string;
  proposalCommitHash?: string | null;
  finalizationMode?: TeamWorkerLaneRecord["finalizationMode"];
  proposalDisposition?: TeamWorkerLaneRecord["proposalDisposition"];
  finalizationCheckpoint?: TeamWorkerLaneRecord["finalizationCheckpoint"];
  latestImplementationCommit?: TeamWorkerLaneRecord["latestImplementationCommit"];
  pushedCommit?: TeamWorkerLaneRecord["pushedCommit"];
  latestDecision?: TeamWorkerLaneRecord["latestDecision"];
  latestCoderSummary?: string | null;
  latestReviewerSummary?: string | null;
  latestActivity?: string | null;
  approvalRequestedAt?: string | null;
  approvalGrantedAt?: string | null;
  runCount?: number;
  revisionCount?: number;
  requeueReason?: TeamWorkerLaneRecord["requeueReason"];
  lastError?: string | null;
  pullRequest?: TeamWorkerLaneRecord["pullRequest"];
  events?: TeamWorkerLaneRecord["events"];
  startedAt?: string | null;
  finishedAt?: string | null;
}): TeamWorkerLaneRecord => {
  return {
    laneId,
    laneIndex,
    status,
    executionPhase: null,
    taskTitle,
    taskObjective,
    proposalChangeName,
    proposalPath,
    proposalCommitHash,
    finalizationMode,
    proposalDisposition,
    finalizationCheckpoint,
    workerSlot,
    branchName,
    baseBranch,
    worktreePath,
    latestImplementationCommit,
    pushedCommit,
    latestCoderHandoff: null,
    latestReviewerHandoff: null,
    latestDecision,
    latestCoderSummary,
    latestReviewerSummary,
    latestActivity,
    approvalRequestedAt,
    approvalGrantedAt,
    queuedAt,
    runCount,
    revisionCount,
    requeueReason,
    lastError,
    pullRequest,
    events,
    startedAt,
    finishedAt,
    updatedAt: FIXED_TIMESTAMP,
  };
};

const createDispatchAssignment = ({
  assignmentNumber,
  lanes,
  repository = dispatchRepository,
  status = "running",
  threadSlot = null,
  plannerWorktreePath = null,
  workerCount = 3,
  requestTitle = "Request",
  conventionalTitle = null,
  requestText = "Implement the request.",
  plannerSummary = "Plan summary",
  plannerDeliverable = "Plan deliverable",
  branchPrefix = "test",
  canonicalBranchName = `requests/test/a${assignmentNumber}`,
  baseBranch = "main",
}: {
  assignmentNumber: number;
  lanes: TeamWorkerLaneRecord[];
  repository?: TeamRepositoryOption | null;
  status?: TeamDispatchAssignment["status"];
  threadSlot?: number | null;
  plannerWorktreePath?: string | null;
  workerCount?: number;
  requestTitle?: string;
  conventionalTitle?: TeamDispatchAssignment["conventionalTitle"];
  requestText?: string;
  plannerSummary?: string;
  plannerDeliverable?: string;
  branchPrefix?: string;
  canonicalBranchName?: string | null;
  baseBranch?: string;
}): TeamDispatchAssignment => {
  return {
    assignmentNumber,
    status,
    repository,
    requestTitle,
    conventionalTitle,
    requestText,
    requestedAt: FIXED_TIMESTAMP,
    startedAt: FIXED_TIMESTAMP,
    finishedAt: null,
    updatedAt: FIXED_TIMESTAMP,
    plannerSummary,
    plannerDeliverable,
    branchPrefix,
    canonicalBranchName,
    baseBranch,
    threadSlot,
    plannerWorktreePath,
    workerCount,
    lanes,
    plannerNotes: [],
    humanFeedback: [],
    supersededAt: null,
    supersededReason: null,
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
  return {
    threadId,
    assignment: createDispatchAssignment({
      assignmentNumber,
      lanes,
      status,
      threadSlot,
      plannerWorktreePath,
    }),
  };
};

const createDispatchThreadRecord = ({
  threadId,
  assignment,
  runStatus = "running",
  archivedAt = null,
}: {
  threadId: string;
  assignment: TeamDispatchAssignment;
  runStatus?: NonNullable<TeamThreadRecord["run"]>["status"];
  archivedAt?: string | null;
}): TeamThreadRecord => {
  return {
    threadId,
    data: {
      teamId: teamConfig.id,
      teamName: teamConfig.name,
      ownerName: teamConfig.owner.name,
      objective: teamConfig.owner.objective,
      selectedRepository: assignment.repository,
      workflow: [...teamConfig.workflow],
      handoffs: {},
      handoffCounter: 0,
      assignmentNumber: assignment.assignmentNumber,
      requestTitle: assignment.requestTitle,
      conventionalTitle: assignment.conventionalTitle,
      requestText: assignment.requestText,
      threadWorktree: null,
      latestInput: assignment.requestText,
      forceReset: false,
    },
    results: [],
    userMessages: [],
    dispatchAssignments: [assignment],
    archivedAt,
    run: {
      status: runStatus,
      startedAt: FIXED_TIMESTAMP,
      finishedAt: null,
      lastError: null,
    },
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
};

describe.sequential("prepareAssignmentReplan", () => {
  let originalThreadFile: string;
  let tempDirectory: string;

  beforeEach(async () => {
    originalThreadFile = teamConfig.storage.threadFile;
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), "prepare-replan-"));
    teamConfig.storage.threadFile = path.join(tempDirectory, "threads.sqlite");
  });

  afterEach(async () => {
    await resetTeamThreadStorageStateCacheForTests();
    teamConfig.storage.threadFile = originalThreadFile;
    await rm(tempDirectory, {
      force: true,
      recursive: true,
    });
  });

  it("rejects archived threads before replanning and leaves their assignment state untouched", async () => {
    await writeStoredThreadRecord(
      createDispatchThreadRecord({
        threadId: "thread-archived-replan",
        assignment: createDispatchAssignment({
          assignmentNumber: 1,
          status: "completed",
          lanes: [
            createDispatchLane({
              laneId: "lane-1",
              laneIndex: 1,
              status: "approved",
              approvalGrantedAt: FIXED_TIMESTAMP,
              finishedAt: FIXED_TIMESTAMP,
            }),
          ],
        }),
        archivedAt: "2026-04-11T09:00:00.000Z",
        runStatus: "completed",
      }),
    );

    const replanPromise = prepareAssignmentReplan({
      threadId: "thread-archived-replan",
      assignmentNumber: 1,
      scope: "assignment",
      suggestion: "Reopen the planning loop.",
    });

    await expect(replanPromise).rejects.toBeInstanceOf(TeamThreadReplanError);
    await expect(replanPromise).rejects.toMatchObject({
      code: "archived",
      message: "Archived threads cannot restart planning.",
      name: "TeamThreadReplanError",
      statusCode: 409,
    });

    const thread = await getTeamThreadRecord(
      teamConfig.storage.threadFile,
      "thread-archived-replan",
    );
    expect(thread?.dispatchAssignments[0]?.supersededAt).toBeNull();
    expect(thread?.dispatchAssignments[0]?.humanFeedback).toHaveLength(0);
  });
});

const basePushedCommit = {
  remoteName: "origin",
  repositoryUrl: "https://github.com/example/meow-team",
  branchUrl: "https://github.com/example/meow-team/tree/requests/example/a1-proposal-1",
  commitUrl: "https://github.com/example/meow-team/commit/review-commit",
  commitHash: "review-commit",
  pushedAt: FIXED_TIMESTAMP,
};

describe("assignPendingDispatchThreadSlots", () => {
  it("assigns shared meow-N slots across active threads and preserves a claimed slot", () => {
    const pendingAssignments = [
      createPendingAssignment({
        threadId: "thread-1",
        assignmentNumber: 1,
        lanes: [
          createDispatchLane({
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
          createDispatchLane({
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
          createDispatchLane({
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
          createDispatchLane({
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
          createDispatchLane({
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
          createDispatchLane({
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
          createDispatchLane({
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
          createDispatchLane({
            laneId: "thread-1-lane-1",
            laneIndex: 1,
            status: "coding",
            workerSlot: 1,
            worktreePath: "/tmp/worktrees/meow-1",
          }),
          createDispatchLane({
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
          createDispatchLane({
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
          createDispatchLane({
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
          createDispatchLane({
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
          createDispatchLane({
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
          createDispatchLane({
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

describe.sequential("ensurePendingDispatchWork", () => {
  let originalWorkerCount: number;
  let getTeamThreadRecordSpy: ReturnType<typeof vi.spyOn>;
  let listPendingDispatchAssignmentsSpy: ReturnType<typeof vi.spyOn> | null;
  let updateTeamThreadRecordSpy: ReturnType<typeof vi.spyOn> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    originalWorkerCount = teamConfig.dispatch.workerCount;
    teamConfig.dispatch.workerCount = 1;
    listPendingDispatchAssignmentsSpy = null;
    updateTeamThreadRecordSpy = null;
    getTeamThreadRecordSpy = vi.spyOn(historyModule, "getTeamThreadRecord").mockResolvedValue(null);
  });

  afterEach(() => {
    getTeamThreadRecordSpy.mockRestore();
    listPendingDispatchAssignmentsSpy?.mockRestore();
    updateTeamThreadRecordSpy?.mockRestore();
    teamConfig.dispatch.workerCount = originalWorkerCount;
  });

  it("does not erase a fresher slot claim when an older allocator pass finishes later", async () => {
    const env = createTeamRunEnv();
    const claimedWorktreePath = path.join(
      dispatchRepository.path,
      teamConfig.dispatch.worktreeRoot,
      "meow-1",
    );
    const claimedWorktree = createWorktree({
      path: claimedWorktreePath,
      rootPath: path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot),
    });
    const threadStore: Record<string, TeamThreadRecord> = {
      "thread-1": createDispatchThreadRecord({
        threadId: "thread-1",
        assignment: createDispatchAssignment({
          assignmentNumber: 1,
          threadSlot: 1,
          plannerWorktreePath: claimedWorktreePath,
          workerCount: 1,
          lanes: [
            createDispatchLane({
              laneId: "thread-1-lane-1",
              laneIndex: 1,
              status: "queued",
            }),
          ],
        }),
      }),
      "thread-2": createDispatchThreadRecord({
        threadId: "thread-2",
        assignment: createDispatchAssignment({
          assignmentNumber: 1,
          threadSlot: 1,
          plannerWorktreePath: claimedWorktreePath,
          workerCount: 1,
          lanes: [
            createDispatchLane({
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
    threadStore["thread-1"].data.threadWorktree = claimedWorktree;
    threadStore["thread-2"].data.threadWorktree = claimedWorktree;

    const buildPendingAssignmentsSnapshot = (threadIds: string[]): PendingDispatchAssignment[] => {
      return threadIds.map((threadId) => ({
        threadId,
        assignment: structuredClone(threadStore[threadId].dispatchAssignments[0]),
      }));
    };

    const pendingSnapshots: PendingDispatchAssignment[][] = [
      buildPendingAssignmentsSnapshot(["thread-1", "thread-2"]),
    ];
    let nestedPassStarted = false;

    getTeamThreadRecordSpy.mockImplementation(
      async (
        _threadFile: Parameters<typeof historyModule.getTeamThreadRecord>[0],
        currentThreadId: Parameters<typeof historyModule.getTeamThreadRecord>[1],
      ) => {
        return structuredClone(threadStore[currentThreadId] ?? null);
      },
    );

    listPendingDispatchAssignmentsSpy = vi
      .spyOn(historyModule, "listPendingDispatchAssignments")
      .mockImplementation(async () => {
        return structuredClone(pendingSnapshots.shift() ?? []);
      });

    updateTeamThreadRecordSpy = vi
      .spyOn(historyModule, "updateTeamThreadRecord")
      .mockImplementation(
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

            pendingSnapshots.push(buildPendingAssignmentsSnapshot(["thread-1"]), [], []);

            await ensurePendingDispatchWork(env);
          }

          const thread = structuredClone(threadStore[threadId]);
          await updater(thread, FIXED_TIMESTAMP);
          thread.updatedAt = FIXED_TIMESTAMP;
          threadStore[threadId] = thread;
        },
      );

    await ensurePendingDispatchWork(env);

    const lane = threadStore["thread-1"].dispatchAssignments[0]?.lanes[0];
    expect(nestedPassStarted).toBe(true);
    expect(lane?.status).toBe("queued");
    expect(lane?.workerSlot).toBe(1);
    expect(lane?.worktreePath).toBe(
      path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot, "meow-1"),
    );
  });
});

describe.sequential("createPlannerDispatchAssignment", () => {
  let originalThreadFile: string;
  let originalWorktreeRoot: string;
  let tempDirectory: string;

  const plannerInput = {
    assignmentNumber: 1,
    repository: dispatchRepository,
    requestTitle: "dev(vsc/command): Fix Parallel Worktree Allocation",
    conventionalTitle: {
      type: "dev" as const,
      scope: "vsc/command",
    },
    requestText: "Isolate planner staging worktrees and shared lane slots across threads.",
    plannerSummary: "Planner summary",
    plannerDeliverable: "Planner deliverable",
    branchPrefix: "parallel-worktrees",
    tasks: [
      {
        title: "Proposal 1",
        objective: "Implement the scoped worktree allocation change.",
      },
    ],
  };

  const writePlannerThread = async (threadId: string) => {
    await upsertTeamThreadRun({
      threadFile: teamConfig.storage.threadFile,
      threadId,
      state: {
        teamId: teamConfig.id,
        teamName: teamConfig.name,
        ownerName: teamConfig.owner.name,
        objective: teamConfig.owner.objective,
        selectedRepository: dispatchRepository,
        workflow: [...teamConfig.workflow],
        handoffs: {},
        handoffCounter: 0,
        assignmentNumber: plannerInput.assignmentNumber,
        requestTitle: plannerInput.requestTitle,
        conventionalTitle: plannerInput.conventionalTitle,
        requestText: plannerInput.requestText,
        threadWorktree: null,
        latestInput: plannerInput.requestText,
        forceReset: false,
      },
      input: plannerInput.requestText,
    });
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    originalThreadFile = teamConfig.storage.threadFile;
    originalWorktreeRoot = teamConfig.dispatch.worktreeRoot;
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), "dispatch-materialize-"));
    teamConfig.storage.threadFile = path.join(tempDirectory, "threads.sqlite");
    deleteManagedBranchesMock.mockResolvedValue(undefined);
    listExistingBranchesMock.mockResolvedValue([]);
    materializeAssignmentProposalsMock.mockResolvedValue(undefined);
    resolveRepositoryBaseBranchMock.mockResolvedValue("main");
  });

  afterEach(async () => {
    await resetTeamThreadStorageStateCacheForTests();
    teamConfig.storage.threadFile = originalThreadFile;
    teamConfig.dispatch.worktreeRoot = originalWorktreeRoot;
    await rm(tempDirectory, {
      force: true,
      recursive: true,
    });
  });

  it("isolates canonical and lane branches when different threads reuse the same prefix", async () => {
    await writePlannerThread("thread-alpha");
    await writePlannerThread("thread-beta");

    const alphaAssignment = await createPlannerDispatchAssignment({
      threadId: "thread-alpha",
      worktree: createManagedPlanningWorktree(dispatchRepository.path, 1),
      ...plannerInput,
    });
    const betaAssignment = await createPlannerDispatchAssignment({
      threadId: "thread-beta",
      worktree: createManagedPlanningWorktree(dispatchRepository.path, 2),
      ...plannerInput,
    });
    const plannerWorktreeRoot = path.join(
      dispatchRepository.path,
      teamConfig.dispatch.worktreeRoot,
    );

    expect(alphaAssignment.canonicalBranchName).toMatch(/^requests\/parallel-worktrees\//);
    expect(betaAssignment.canonicalBranchName).toMatch(/^requests\/parallel-worktrees\//);
    expect(alphaAssignment.canonicalBranchName).not.toBe(betaAssignment.canonicalBranchName);
    expect(alphaAssignment.lanes[0]?.branchName).not.toBe(betaAssignment.lanes[0]?.branchName);

    expect(materializeAssignmentProposalsMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        repositoryPath: dispatchRepository.path,
        baseBranch: "main",
        canonicalBranchName: alphaAssignment.canonicalBranchName,
        requestTitle: plannerInput.requestTitle,
        conventionalTitle: plannerInput.conventionalTitle,
        worktreeRoot: plannerWorktreeRoot,
        plannerWorktreePath: `${plannerWorktreeRoot}/meow-1`,
        lanes: expect.arrayContaining([
          expect.objectContaining({
            branchName: alphaAssignment.lanes[0]?.branchName,
            proposalChangeName: alphaAssignment.lanes[0]?.proposalChangeName,
          }),
        ]),
      }),
    );
    expect(materializeAssignmentProposalsMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        repositoryPath: dispatchRepository.path,
        baseBranch: "main",
        canonicalBranchName: betaAssignment.canonicalBranchName,
        requestTitle: plannerInput.requestTitle,
        conventionalTitle: plannerInput.conventionalTitle,
        worktreeRoot: plannerWorktreeRoot,
        plannerWorktreePath: `${plannerWorktreeRoot}/meow-2`,
        lanes: expect.arrayContaining([
          expect.objectContaining({
            branchName: betaAssignment.lanes[0]?.branchName,
            proposalChangeName: betaAssignment.lanes[0]?.proposalChangeName,
          }),
        ]),
      }),
    );
  });

  it("reuses the same branch namespace when rematerializing the same thread assignment", async () => {
    await writePlannerThread("thread-alpha");

    const firstAssignment = await createPlannerDispatchAssignment({
      threadId: "thread-alpha",
      worktree: createManagedPlanningWorktree(dispatchRepository.path, 1),
      ...plannerInput,
    });
    const secondAssignment = await createPlannerDispatchAssignment({
      threadId: "thread-alpha",
      worktree: createManagedPlanningWorktree(dispatchRepository.path, 1),
      ...plannerInput,
    });

    expect(firstAssignment.canonicalBranchName).toBe(secondAssignment.canonicalBranchName);
    expect(firstAssignment.lanes[0]?.branchName).toBe(secondAssignment.lanes[0]?.branchName);
  });

  it("keeps slash-delimited conventional scope metadata out of branch namespaces", async () => {
    await writePlannerThread("thread-scope");

    const assignment = await createPlannerDispatchAssignment({
      threadId: "thread-scope",
      worktree: createManagedPlanningWorktree(dispatchRepository.path, 1),
      ...plannerInput,
    });

    expect(assignment.canonicalBranchName).toContain("parallel-worktrees");
    expect(assignment.canonicalBranchName).not.toContain("vsc/command");
    expect(assignment.lanes[0]?.proposalChangeName).not.toContain("vsc/command");
    expect(assignment.conventionalTitle).toEqual(plannerInput.conventionalTitle);
  });

  it("passes absolute managed worktree roots through without rebasing them on the repository", async () => {
    await writePlannerThread("thread-absolute-root");
    teamConfig.dispatch.worktreeRoot = path.join(tempDirectory, "shared-worktrees");

    const assignment = await createPlannerDispatchAssignment({
      threadId: "thread-absolute-root",
      worktree: createManagedPlanningWorktree(dispatchRepository.path, 1),
      ...plannerInput,
    });

    expect(materializeAssignmentProposalsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreeRoot: teamConfig.dispatch.worktreeRoot,
        plannerWorktreePath: `${teamConfig.dispatch.worktreeRoot}/meow-1`,
      }),
    );
    expect(assignment.plannerWorktreePath).toBe(`${teamConfig.dispatch.worktreeRoot}/meow-1`);
  });

  it("keeps proposals non-approvable until materialization finishes", async () => {
    await writePlannerThread("thread-pending-materialization");

    let resolveMaterialization!: () => void;
    materializeAssignmentProposalsMock.mockImplementationOnce(
      async () =>
        await new Promise<void>((resolve) => {
          resolveMaterialization = () => resolve();
        }),
    );

    const assignmentPromise = createPlannerDispatchAssignment({
      threadId: "thread-pending-materialization",
      worktree: createManagedPlanningWorktree(dispatchRepository.path, 1),
      ...plannerInput,
    });

    await vi.waitFor(() => {
      expect(materializeAssignmentProposalsMock).toHaveBeenCalledTimes(1);
    });

    const pendingThread = await getTeamThreadRecord(
      teamConfig.storage.threadFile,
      "thread-pending-materialization",
    );
    const pendingAssignment = pendingThread?.dispatchAssignments[0];
    const pendingLane = pendingAssignment?.lanes[0];

    expect(pendingAssignment?.status).toBe("planning");
    expect(pendingLane?.status).toBe("idle");
    expect(pendingLane?.approvalRequestedAt).toBeNull();
    expect(pendingLane?.latestActivity).toContain("materializing");

    const releaseMaterialization = resolveMaterialization as (() => void) | null;
    if (releaseMaterialization) {
      releaseMaterialization();
    }
    const assignment = await assignmentPromise;

    expect(assignment.status).toBe("awaiting_human_approval");
    expect(assignment.lanes[0]?.status).toBe("awaiting_human_approval");
    expect(assignment.lanes[0]?.approvalRequestedAt).toBeTruthy();

    const completedThread = await getTeamThreadRecord(
      teamConfig.storage.threadFile,
      "thread-pending-materialization",
    );
    expect(completedThread?.dispatchAssignments[0]?.status).toBe("awaiting_human_approval");
    expect(completedThread?.dispatchAssignments[0]?.lanes[0]?.status).toBe(
      "awaiting_human_approval",
    );
  });
});

describe.sequential("approveLaneProposal", () => {
  let originalThreadFile: string;
  let tempDirectory: string;

  const createExecutionDependencies = ({
    coderRun,
    reviewerRun,
  }: {
    coderRun?: TeamRoleDependencies["coderAgent"]["run"];
    reviewerRun?: TeamRoleDependencies["reviewerAgent"]["run"];
  } = {}): TeamRoleDependencies => {
    return {
      executor: vi.fn() as TeamRoleDependencies["executor"],
      requestTitleAgent: {
        run: vi.fn(),
      },
      plannerAgent: {
        run: vi.fn(),
      },
      openSpecMaterializerAgent: {
        run: vi.fn(),
      },
      coderAgent: {
        run:
          coderRun ??
          (vi.fn(async () => ({
            summary: "Implemented the approved proposal.",
            deliverable: "Implementation is ready for machine review.",
            decision: "continue" as const,
            pullRequestTitle: null,
            pullRequestSummary: null,
          })) as TeamRoleDependencies["coderAgent"]["run"]),
      },
      reviewerAgent: {
        run:
          reviewerRun ??
          (vi.fn(async () => ({
            summary: "Machine review approved the branch.",
            deliverable: "Implementation looks correct.",
            decision: "approved" as const,
            pullRequestTitle: "Ship the feature",
            pullRequestSummary: "Machine review approved the branch.",
          })) as TeamRoleDependencies["reviewerAgent"]["run"]),
      },
      executorAgent: {
        run: vi.fn(),
      },
      executionReviewerAgent: {
        run: vi.fn(),
      },
    };
  };

  const createExecutionEnv = ({
    coderRun,
    reviewerRun,
  }: {
    coderRun?: TeamRoleDependencies["coderAgent"]["run"];
    reviewerRun?: TeamRoleDependencies["reviewerAgent"]["run"];
  } = {}): TeamRunEnv => {
    return createTeamRunEnv({
      dependencies: createExecutionDependencies({
        coderRun,
        reviewerRun,
      }),
    });
  };

  const createProposalApprovalLane = (
    overrides: Partial<TeamWorkerLaneRecord> = {},
  ): TeamWorkerLaneRecord => {
    return {
      ...createDispatchLane({
        laneId: "lane-1",
        laneIndex: 1,
        status: "awaiting_human_approval",
        branchName: "requests/example/a1-proposal-1",
        baseBranch: "main",
        taskTitle: "Ship the feature",
        taskObjective: "Implement the approved proposal.",
        proposalChangeName: "change-1",
        proposalPath: "openspec/changes/change-1",
        approvalRequestedAt: FIXED_TIMESTAMP,
        queuedAt: null,
      }),
      ...overrides,
    };
  };

  const createDraftTrackingPullRequest = (
    overrides: Partial<NonNullable<TeamWorkerLaneRecord["pullRequest"]>> = {},
  ): NonNullable<TeamWorkerLaneRecord["pullRequest"]> => {
    return {
      id: "pr-1",
      provider: "github",
      title: "Ship the feature",
      summary: "Implement the approved proposal.",
      branchName: "requests/example/a1-proposal-1",
      baseBranch: "main",
      status: "draft",
      requestedAt: FIXED_TIMESTAMP,
      humanApprovalRequestedAt: null,
      humanApprovedAt: null,
      machineReviewedAt: null,
      updatedAt: FIXED_TIMESTAMP,
      url: "https://github.com/example/meow-team/pull/42",
      ...overrides,
    };
  };

  const writeExecutionThreadStore = async ({
    threadId,
    lane,
    assignmentOverrides = {},
    runStatus = "awaiting_human_approval",
  }: {
    threadId: string;
    lane: TeamWorkerLaneRecord;
    assignmentOverrides?: Partial<TeamDispatchAssignment>;
    runStatus?: NonNullable<TeamThreadRecord["run"]>["status"];
  }) => {
    const worktreeRoot = path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot);
    const assignment = createDispatchAssignment({
      assignmentNumber: 1,
      repository: dispatchRepository,
      status: assignmentOverrides.status ?? "awaiting_human_approval",
      requestTitle: assignmentOverrides.requestTitle ?? "Ship the feature",
      conventionalTitle: assignmentOverrides.conventionalTitle ?? null,
      requestText: assignmentOverrides.requestText ?? "Implement the approved proposal.",
      plannerSummary: assignmentOverrides.plannerSummary ?? "Planner summary",
      plannerDeliverable: assignmentOverrides.plannerDeliverable ?? "Planner deliverable",
      branchPrefix: assignmentOverrides.branchPrefix ?? "example",
      canonicalBranchName: assignmentOverrides.canonicalBranchName ?? "requests/example/a1",
      workerCount: assignmentOverrides.workerCount ?? 1,
      threadSlot: assignmentOverrides.threadSlot ?? 1,
      plannerWorktreePath: assignmentOverrides.plannerWorktreePath ?? `${worktreeRoot}/meow-1`,
      lanes: [lane],
    });

    await writeStoredThreadRecord(
      createDispatchThreadRecord({
        threadId,
        assignment,
        runStatus,
      }),
    );
  };

  const runQueuedLaneExecution = async ({
    threadId,
    laneOverrides = {},
    assignmentOverrides = {},
    coderRun,
    reviewerRun,
  }: {
    threadId: string;
    laneOverrides?: Partial<TeamWorkerLaneRecord>;
    assignmentOverrides?: Partial<TeamDispatchAssignment>;
    coderRun?: TeamRoleDependencies["coderAgent"]["run"];
    reviewerRun?: TeamRoleDependencies["reviewerAgent"]["run"];
  }) => {
    const worktreeRoot = path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot);

    await writeExecutionThreadStore({
      threadId,
      lane: createProposalApprovalLane({
        status: "queued",
        workerSlot: 1,
        worktreePath: `${worktreeRoot}/meow-1`,
        approvalGrantedAt: FIXED_TIMESTAMP,
        queuedAt: FIXED_TIMESTAMP,
        pullRequest: createDraftTrackingPullRequest(),
        ...laneOverrides,
      }),
      assignmentOverrides: {
        status: "running",
        ...assignmentOverrides,
      },
      runStatus: "running",
    });

    await ensurePendingDispatchWork(
      createExecutionEnv({
        coderRun,
        reviewerRun,
      }),
      threadId,
    );
    await waitForLaneRunCompletion(threadId, 1, "lane-1");
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    originalThreadFile = teamConfig.storage.threadFile;
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), "dispatch-proposal-"));
    teamConfig.storage.threadFile = path.join(tempDirectory, "threads.sqlite");
    commitWorktreeChangesMock.mockResolvedValue(undefined);
    commitContainsPathMock.mockReset();
    commitContainsPathMock.mockResolvedValue(true);
    synchronizePullRequestMock.mockReset();
    detectBranchConflictMock.mockReset();
    detectBranchConflictMock.mockResolvedValue(false);
    ensureLaneWorktreeMock.mockReset();
    ensureLaneWorktreeMock.mockResolvedValue(undefined);
    findCommitContainingPathInReflogMock.mockReset();
    findCommitContainingPathInReflogMock.mockResolvedValue(null);
    getBranchHeadMock.mockReset();
    hasWorktreeChangesMock.mockReset();
    hasWorktreeChangesMock.mockResolvedValue(false);
    pushLaneBranchMock.mockReset();
    configurePublishLaneBranchHeadMock();
    tryRebaseWorktreeBranchMock.mockReset();
    tryRebaseWorktreeBranchMock.mockResolvedValue({
      applied: true,
      error: null,
    });
  });

  afterEach(async () => {
    await resetTeamThreadStorageStateCacheForTests();
    teamConfig.storage.threadFile = originalThreadFile;
    await rm(tempDirectory, {
      force: true,
      recursive: true,
    });
  });

  it("creates a draft GitHub PR before coding and rebases cleanly onto main before readying the tracking PR", async () => {
    const worktreeRoot = path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot);
    const laneWorktree = createWorktree({
      path: `${worktreeRoot}/meow-1`,
      rootPath: worktreeRoot,
    });
    let resolveCoder: (
      value: Awaited<ReturnType<TeamRoleDependencies["coderAgent"]["run"]>>,
    ) => void = () => {
      throw new Error("Coder resolver was not initialized.");
    };
    const coderRun = vi.fn((input: Parameters<TeamRoleDependencies["coderAgent"]["run"]>[0]) => {
      expect(input.state.worktree).toEqual(laneWorktree);
      return new Promise<Awaited<ReturnType<TeamRoleDependencies["coderAgent"]["run"]>>>(
        (resolve) => {
          resolveCoder = resolve;
        },
      );
    }) as TeamRoleDependencies["coderAgent"]["run"];
    const reviewerRun = vi.fn(
      async (input: Parameters<TeamRoleDependencies["reviewerAgent"]["run"]>[0]) => {
        expect(input.state.worktree).toEqual(laneWorktree);
        return {
          summary: "Machine review approved the branch.",
          deliverable: "Implementation looks correct.",
          decision: "approved" as const,
          pullRequestTitle: "Ship the feature",
          pullRequestSummary: "Machine review approved the branch.",
        };
      },
    ) as TeamRoleDependencies["reviewerAgent"]["run"];

    getBranchHeadMock
      .mockResolvedValueOnce("proposal-commit")
      .mockResolvedValueOnce("proposal-commit")
      .mockResolvedValueOnce("review-commit")
      .mockResolvedValueOnce("rebased-review-commit");
    pushLaneBranchMock
      .mockResolvedValueOnce({
        ...basePushedCommit,
        commitHash: "proposal-commit",
        commitUrl: "https://github.com/example/meow-team/commit/proposal-commit",
      })
      .mockResolvedValueOnce({
        ...basePushedCommit,
        commitHash: "review-commit",
        commitUrl: "https://github.com/example/meow-team/commit/review-commit",
      })
      .mockResolvedValueOnce({
        ...basePushedCommit,
        commitHash: "rebased-review-commit",
      });
    synchronizePullRequestMock
      .mockResolvedValueOnce({
        url: "https://github.com/example/meow-team/pull/42",
      })
      .mockResolvedValueOnce({
        url: "https://github.com/example/meow-team/pull/42",
      });

    await writeExecutionThreadStore({
      threadId: "thread-proposal",
      lane: createProposalApprovalLane(),
    });

    await approveLaneProposal({
      env: createExecutionEnv({
        coderRun,
        reviewerRun,
      }),
      threadId: "thread-proposal",
      assignmentNumber: 1,
      laneId: "lane-1",
    });

    await vi.waitFor(async () => {
      expect(coderRun).toHaveBeenCalledTimes(1);
      const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-proposal");
      const lane = thread?.dispatchAssignments[0]?.lanes[0];
      expect(lane?.pullRequest?.status).toBe("draft");
      expect(lane?.pullRequest?.provider).toBe("github");
      expect(lane?.pullRequest?.url).toBe("https://github.com/example/meow-team/pull/42");
    });

    const draftThread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-proposal");
    const draftLane = draftThread?.dispatchAssignments[0]?.lanes[0];
    const trackingPullRequestId = draftLane?.pullRequest?.id;

    expect(ensureBranchRefMock).toHaveBeenCalledWith({
      repositoryPath: dispatchRepository.path,
      branchName: "requests/example/a1-proposal-1",
      startPoint: "requests/example/a1",
      forceUpdate: true,
    });
    expect(pushLaneBranchMock).toHaveBeenNthCalledWith(1, {
      repositoryPath: laneWorktree.path,
      branchName: "requests/example/a1-proposal-1",
      commitHash: "proposal-commit",
    });
    expect(synchronizePullRequestMock).toHaveBeenNthCalledWith(1, {
      repositoryPath: laneWorktree.path,
      branchName: "requests/example/a1-proposal-1",
      baseBranch: "main",
      title: "Ship the feature",
      body: "Implement the approved proposal.",
      draft: true,
    });

    resolveCoder({
      summary: "Implemented the approved proposal.",
      deliverable: "Implementation is ready for machine review.",
      decision: "continue",
      pullRequestTitle: null,
      pullRequestSummary: null,
    });

    await vi.waitFor(async () => {
      const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-proposal");
      const lane = thread?.dispatchAssignments[0]?.lanes[0];
      expect(lane?.status).toBe("approved");
      expect(lane?.pullRequest?.status).toBe("awaiting_human_approval");
      expect(lane?.pullRequest?.provider).toBe("github");
      expect(lane?.pullRequest?.machineReviewedAt).toBeTruthy();
      expect(lane?.pullRequest?.id).toBe(trackingPullRequestId);
      expect(lane?.latestActivity).toContain("marked the tracking PR ready");
    });

    expect(tryRebaseWorktreeBranchMock).toHaveBeenCalledWith({
      worktreePath: `${path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot)}/meow-1`,
      baseBranch: "main",
    });
    expect(pushLaneBranchMock).toHaveBeenNthCalledWith(2, {
      repositoryPath: laneWorktree.path,
      branchName: "requests/example/a1-proposal-1",
      commitHash: "review-commit",
    });
    expect(pushLaneBranchMock).toHaveBeenNthCalledWith(3, {
      repositoryPath: laneWorktree.path,
      branchName: "requests/example/a1-proposal-1",
      commitHash: "rebased-review-commit",
    });
    expect(synchronizePullRequestMock).toHaveBeenNthCalledWith(2, {
      repositoryPath: laneWorktree.path,
      branchName: "requests/example/a1-proposal-1",
      baseBranch: "main",
      title: "Ship the feature",
      body: "Machine review approved the branch.",
      draft: false,
    });
  });

  it("publishes the implementation head before reviewer-requested changes requeue the lane", async () => {
    let secondCoderStarted = false;
    let resolveSecondCoder: (
      value: Awaited<ReturnType<TeamRoleDependencies["coderAgent"]["run"]>>,
    ) => void = () => undefined;
    const secondCoderPromise = new Promise<
      Awaited<ReturnType<TeamRoleDependencies["coderAgent"]["run"]>>
    >((resolve) => {
      resolveSecondCoder = resolve;
    });
    const coderRun = vi
      .fn<TeamRoleDependencies["coderAgent"]["run"]>()
      .mockResolvedValueOnce({
        summary: "Implemented the approved proposal.",
        deliverable: "Implementation is ready for machine review.",
        decision: "continue",
        pullRequestTitle: null,
        pullRequestSummary: null,
      })
      .mockImplementationOnce(() => {
        secondCoderStarted = true;
        return secondCoderPromise;
      }) as TeamRoleDependencies["coderAgent"]["run"];
    const reviewerRun = vi.fn(async () => ({
      summary: "Follow up on the reviewer note.",
      deliverable: "Please address the failing path.",
      decision: "needs_revision" as const,
      pullRequestTitle: null,
      pullRequestSummary: null,
    })) as TeamRoleDependencies["reviewerAgent"]["run"];

    getBranchHeadMock
      .mockResolvedValueOnce("proposal-commit")
      .mockResolvedValueOnce("implementation-commit")
      .mockResolvedValueOnce("implementation-commit");
    pushLaneBranchMock.mockResolvedValue({
      ...basePushedCommit,
      commitHash: "implementation-commit",
      commitUrl: "https://github.com/example/meow-team/commit/implementation-commit",
    });

    await writeExecutionThreadStore({
      threadId: "thread-stage-publish-requeue",
      lane: createProposalApprovalLane({
        status: "queued",
        workerSlot: 1,
        worktreePath: `${path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot)}/meow-1`,
        approvalGrantedAt: FIXED_TIMESTAMP,
        queuedAt: FIXED_TIMESTAMP,
        pullRequest: createDraftTrackingPullRequest(),
      }),
      assignmentOverrides: {
        status: "running",
      },
      runStatus: "running",
    });

    await ensurePendingDispatchWork(
      createExecutionEnv({
        coderRun,
        reviewerRun,
      }),
      "thread-stage-publish-requeue",
    );

    await vi.waitFor(async () => {
      expect(secondCoderStarted).toBe(true);
      const lane = (
        await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-stage-publish-requeue")
      )?.dispatchAssignments[0]?.lanes[0];
      expect(lane?.status).toBe("coding");
      expect(lane?.requeueReason).toBe("reviewer_requested_changes");
      expect(lane?.latestImplementationCommit).toBe("implementation-commit");
      expect(lane?.pushedCommit?.commitHash).toBe("implementation-commit");
      expect(lane?.latestActivity).toContain("addressing reviewer-requested changes");
    });

    expect(pushLaneBranchMock).toHaveBeenCalledTimes(1);
    expect(pushLaneBranchMock).toHaveBeenCalledWith({
      repositoryPath: `${path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot)}/meow-1`,
      branchName: "requests/example/a1-proposal-1",
      commitHash: "implementation-commit",
    });

    resolveSecondCoder({
      summary: "Still implementing the requested changes.",
      deliverable: "No branch changes yet.",
      decision: "continue",
      pullRequestTitle: null,
      pullRequestSummary: null,
    });
    await waitForLaneRunCompletion("thread-stage-publish-requeue", 1, "lane-1");
  });

  it("publishes reviewer feedback artifacts before requeueing the coder", async () => {
    let secondCoderStarted = false;
    let resolveSecondCoder: (
      value: Awaited<ReturnType<TeamRoleDependencies["coderAgent"]["run"]>>,
    ) => void = () => undefined;
    const secondCoderPromise = new Promise<
      Awaited<ReturnType<TeamRoleDependencies["coderAgent"]["run"]>>
    >((resolve) => {
      resolveSecondCoder = resolve;
    });
    const coderRun = vi
      .fn<TeamRoleDependencies["coderAgent"]["run"]>()
      .mockResolvedValueOnce({
        summary: "Implemented the approved proposal.",
        deliverable: "Implementation is ready for machine review.",
        decision: "continue",
        pullRequestTitle: null,
        pullRequestSummary: null,
      })
      .mockImplementationOnce(() => {
        secondCoderStarted = true;
        return secondCoderPromise;
      }) as TeamRoleDependencies["coderAgent"]["run"];
    const reviewerRun = vi.fn(async () => ({
      summary: "The reviewer left a failing artifact to fix.",
      deliverable: "Repair the failing review artifact.",
      decision: "needs_revision" as const,
      pullRequestTitle: null,
      pullRequestSummary: null,
    })) as TeamRoleDependencies["reviewerAgent"]["run"];

    hasWorktreeChangesMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    getBranchHeadMock
      .mockResolvedValueOnce("proposal-commit")
      .mockResolvedValueOnce("implementation-commit")
      .mockResolvedValueOnce("review-feedback-commit");
    pushLaneBranchMock
      .mockResolvedValueOnce({
        ...basePushedCommit,
        commitHash: "implementation-commit",
        commitUrl: "https://github.com/example/meow-team/commit/implementation-commit",
      })
      .mockResolvedValueOnce({
        ...basePushedCommit,
        commitHash: "review-feedback-commit",
        commitUrl: "https://github.com/example/meow-team/commit/review-feedback-commit",
      });

    const worktreeRoot = path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot);
    await writeExecutionThreadStore({
      threadId: "thread-review-feedback-publish",
      lane: createProposalApprovalLane({
        status: "queued",
        workerSlot: 1,
        worktreePath: `${worktreeRoot}/meow-1`,
        approvalGrantedAt: FIXED_TIMESTAMP,
        queuedAt: FIXED_TIMESTAMP,
        pullRequest: createDraftTrackingPullRequest(),
      }),
      assignmentOverrides: {
        status: "running",
      },
      runStatus: "running",
    });

    await ensurePendingDispatchWork(
      createExecutionEnv({
        coderRun,
        reviewerRun,
      }),
      "thread-review-feedback-publish",
    );
    await vi.waitFor(async () => {
      expect(secondCoderStarted).toBe(true);
      const lane = (
        await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-review-feedback-publish")
      )?.dispatchAssignments[0]?.lanes[0];
      expect(commitWorktreeChangesMock).toHaveBeenCalledWith({
        worktreePath: `${worktreeRoot}/meow-1`,
        message: "fix: record reviewer feedback for Ship the feature",
      });
      expect(pushLaneBranchMock).toHaveBeenNthCalledWith(1, {
        repositoryPath: `${worktreeRoot}/meow-1`,
        branchName: "requests/example/a1-proposal-1",
        commitHash: "implementation-commit",
      });
      expect(pushLaneBranchMock).toHaveBeenNthCalledWith(2, {
        repositoryPath: `${worktreeRoot}/meow-1`,
        branchName: "requests/example/a1-proposal-1",
        commitHash: "review-feedback-commit",
      });
      expect(lane?.status).toBe("coding");
      expect(lane?.requeueReason).toBe("reviewer_requested_changes");
      expect(lane?.latestImplementationCommit).toBe("review-feedback-commit");
      expect(lane?.pushedCommit?.commitHash).toBe("review-feedback-commit");
      expect(lane?.latestActivity).toContain("addressing reviewer-requested changes");
    });

    resolveSecondCoder({
      summary: "Working on the reviewer feedback.",
      deliverable: "No follow-up commit yet.",
      decision: "continue",
      pullRequestTitle: null,
      pullRequestSummary: null,
    });
    await waitForLaneRunCompletion("thread-review-feedback-publish", 1, "lane-1");
  });

  it("fails the lane when publishing the implementation head before review fails", async () => {
    const reviewerRun = vi.fn() as TeamRoleDependencies["reviewerAgent"]["run"];

    getBranchHeadMock
      .mockResolvedValueOnce("proposal-commit")
      .mockResolvedValueOnce("implementation-commit");
    pushLaneBranchMock.mockRejectedValueOnce(new Error("gh auth token missing"));

    await runQueuedLaneExecution({
      threadId: "thread-stage-publish-failure",
      reviewerRun,
    });

    const lane = (
      await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-stage-publish-failure")
    )?.dispatchAssignments[0]?.lanes[0];

    expect(reviewerRun).not.toHaveBeenCalled();
    expect(lane?.status).toBe("failed");
    expect(lane?.latestImplementationCommit).toBe("implementation-commit");
    expect(lane?.pushedCommit).toBeNull();
    expect(lane?.latestActivity).toContain(
      "publishing the lane branch to GitHub failed before review could start",
    );
    expect(lane?.lastError).toContain("gh auth token missing");
  });

  it("uses a dev commit prefix for default implementation work", async () => {
    const worktreeRoot = path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot);

    hasWorktreeChangesMock.mockResolvedValue(true);
    getBranchHeadMock
      .mockResolvedValueOnce("proposal-commit")
      .mockResolvedValueOnce("implementation-commit")
      .mockResolvedValueOnce("implementation-commit");
    pushLaneBranchMock.mockResolvedValue({
      ...basePushedCommit,
      commitHash: "implementation-commit",
      commitUrl: "https://github.com/example/meow-team/commit/implementation-commit",
    });
    synchronizePullRequestMock.mockResolvedValue({
      url: "https://github.com/example/meow-team/pull/42",
    });

    await runQueuedLaneExecution({
      threadId: "thread-dev-prefix",
    });

    expect(commitWorktreeChangesMock).toHaveBeenCalledWith({
      worktreePath: `${worktreeRoot}/meow-1`,
      message: "dev: implement Ship the feature",
    });
    expect(commitWorktreeChangesMock).toHaveBeenCalledTimes(1);
  });

  it("uses a test commit prefix for explicit test-only work", async () => {
    const worktreeRoot = path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot);

    hasWorktreeChangesMock.mockResolvedValue(true);
    getBranchHeadMock
      .mockResolvedValueOnce("proposal-commit")
      .mockResolvedValueOnce("test-commit")
      .mockResolvedValueOnce("test-commit");
    pushLaneBranchMock.mockResolvedValue({
      ...basePushedCommit,
      commitHash: "test-commit",
      commitUrl: "https://github.com/example/meow-team/commit/test-commit",
    });
    synchronizePullRequestMock.mockResolvedValue({
      url: "https://github.com/example/meow-team/pull/43",
    });

    await runQueuedLaneExecution({
      threadId: "thread-test-prefix",
      laneOverrides: {
        taskTitle: "Add regression coverage",
        taskObjective: "Add explicit test-only coverage for the queue runner.",
      },
      assignmentOverrides: {
        requestTitle: "test(team/dispatch): add regression coverage",
        conventionalTitle: {
          type: "test",
          scope: "team/dispatch",
        },
      },
    });

    expect(commitWorktreeChangesMock).toHaveBeenCalledWith({
      worktreePath: `${worktreeRoot}/meow-1`,
      message: "test: implement Add regression coverage",
    });
    expect(commitWorktreeChangesMock).toHaveBeenCalledTimes(1);
  });

  it("uses a fix commit prefix for repair-oriented reruns", async () => {
    const worktreeRoot = path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot);

    hasWorktreeChangesMock.mockResolvedValue(true);
    getBranchHeadMock
      .mockResolvedValueOnce("review-commit")
      .mockResolvedValueOnce("fix-commit")
      .mockResolvedValueOnce("fix-commit");
    pushLaneBranchMock.mockResolvedValue({
      ...basePushedCommit,
      commitHash: "fix-commit",
      commitUrl: "https://github.com/example/meow-team/commit/fix-commit",
    });
    synchronizePullRequestMock.mockResolvedValue({
      url: "https://github.com/example/meow-team/pull/44",
    });

    await runQueuedLaneExecution({
      threadId: "thread-fix-prefix",
      laneOverrides: {
        requeueReason: "reviewer_requested_changes",
      },
    });

    expect(commitWorktreeChangesMock).toHaveBeenCalledWith({
      worktreePath: `${worktreeRoot}/meow-1`,
      message: "fix: address review feedback for Ship the feature",
    });
    expect(commitWorktreeChangesMock).toHaveBeenCalledTimes(1);
  });

  it("derives and persists a canonical branch name when legacy records omit it", async () => {
    const threadId = "thread-legacy-canonical";
    const branchPrefix = "status-lane-tooltip";
    const canonicalBranchName = buildCanonicalBranchName({
      threadId,
      branchPrefix,
      assignmentNumber: 1,
    });
    const laneBranchName = buildLaneBranchName({
      threadId,
      branchPrefix,
      assignmentNumber: 1,
      laneIndex: 1,
    });
    const pendingCoderRun = vi.fn(
      () => new Promise<Awaited<ReturnType<TeamRoleDependencies["coderAgent"]["run"]>>>(() => {}),
    ) as TeamRoleDependencies["coderAgent"]["run"];

    getBranchHeadMock
      .mockResolvedValueOnce("proposal-commit")
      .mockResolvedValueOnce("proposal-commit");
    pushLaneBranchMock.mockResolvedValueOnce({
      ...basePushedCommit,
      commitHash: "proposal-commit",
      commitUrl: "https://github.com/example/meow-team/commit/proposal-commit",
    });
    synchronizePullRequestMock.mockResolvedValueOnce({
      url: "https://github.com/example/meow-team/pull/42",
    });

    const worktreeRoot = path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot);
    await writeStoredThreadRecord(
      createDispatchThreadRecord({
        threadId,
        assignment: createDispatchAssignment({
          assignmentNumber: 1,
          repository: dispatchRepository,
          status: "awaiting_human_approval",
          requestTitle: "Ship the feature",
          conventionalTitle: null,
          requestText: "Implement the approved proposal.",
          plannerSummary: "Planner summary",
          plannerDeliverable: "Planner deliverable",
          branchPrefix,
          canonicalBranchName: null,
          workerCount: 1,
          threadSlot: 1,
          plannerWorktreePath: `${worktreeRoot}/meow-1`,
          lanes: [
            createProposalApprovalLane({
              branchName: laneBranchName,
            }),
          ],
        }),
        runStatus: "awaiting_human_approval",
      }),
    );

    await approveLaneProposal({
      env: createExecutionEnv({
        coderRun: pendingCoderRun,
      }),
      threadId,
      assignmentNumber: 1,
      laneId: "lane-1",
    });

    expect(ensureBranchRefMock).toHaveBeenCalledWith({
      repositoryPath: dispatchRepository.path,
      branchName: laneBranchName,
      startPoint: canonicalBranchName,
      forceUpdate: true,
    });
    await vi.waitFor(() => {
      expect(pendingCoderRun).toHaveBeenCalledTimes(1);
    });

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
    expect(thread?.dispatchAssignments[0]?.canonicalBranchName).toBe(canonicalBranchName);
    expect(thread?.dispatchAssignments[0]?.lanes[0]?.proposalCommitHash).toBe("proposal-commit");
  });

  it("recovers a missing proposal branch from the claimed thread worktree reflog", async () => {
    const threadId = "01fba175-e48a-4999-a458-d970d82198f7";
    const branchPrefix = "status-lane-tooltip";
    const canonicalBranchName = buildCanonicalBranchName({
      threadId,
      branchPrefix,
      assignmentNumber: 1,
    });
    const laneBranchName = buildLaneBranchName({
      threadId,
      branchPrefix,
      assignmentNumber: 1,
      laneIndex: 1,
    });
    const threadWorktreePath = `${path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot)}/meow-1`;
    const pendingCoderRun = vi.fn(
      () => new Promise<Awaited<ReturnType<TeamRoleDependencies["coderAgent"]["run"]>>>(() => {}),
    ) as TeamRoleDependencies["coderAgent"]["run"];

    getBranchHeadMock
      .mockRejectedValueOnce(
        new Error(
          `fatal: ambiguous argument '${canonicalBranchName}': unknown revision or path not in the working tree.`,
        ),
      )
      .mockRejectedValueOnce(
        new Error(
          `fatal: ambiguous argument '${laneBranchName}': unknown revision or path not in the working tree.`,
        ),
      )
      .mockResolvedValueOnce("main-commit")
      .mockResolvedValueOnce("proposal-commit");
    commitContainsPathMock.mockResolvedValue(false);
    findCommitContainingPathInReflogMock.mockResolvedValue("proposal-commit");
    pushLaneBranchMock.mockResolvedValueOnce({
      ...basePushedCommit,
      commitHash: "proposal-commit",
      commitUrl: "https://github.com/example/meow-team/commit/proposal-commit",
    });
    synchronizePullRequestMock.mockResolvedValueOnce({
      url: "https://github.com/example/meow-team/pull/42",
    });

    const worktreeRoot = path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot);
    await writeStoredThreadRecord(
      createDispatchThreadRecord({
        threadId,
        assignment: createDispatchAssignment({
          assignmentNumber: 1,
          repository: dispatchRepository,
          status: "awaiting_human_approval",
          requestTitle: "Ship the feature",
          conventionalTitle: null,
          requestText: "Implement the approved proposal.",
          plannerSummary: "Planner summary",
          plannerDeliverable: "Planner deliverable",
          branchPrefix,
          canonicalBranchName: null,
          workerCount: 1,
          threadSlot: 1,
          plannerWorktreePath: `${worktreeRoot}/meow-1`,
          lanes: [
            createProposalApprovalLane({
              branchName: laneBranchName,
            }),
          ],
        }),
        runStatus: "awaiting_human_approval",
      }),
    );

    await approveLaneProposal({
      env: createExecutionEnv({
        coderRun: pendingCoderRun,
      }),
      threadId,
      assignmentNumber: 1,
      laneId: "lane-1",
    });

    expect(getBranchHeadMock).toHaveBeenNthCalledWith(3, {
      repositoryPath: threadWorktreePath,
      branchName: "HEAD",
    });
    expect(findCommitContainingPathInReflogMock).toHaveBeenCalledWith({
      worktreePath: threadWorktreePath,
      relativePath: `${createProposalApprovalLane().proposalPath}/.openspec.yaml`,
    });
    expect(ensureBranchRefMock).toHaveBeenNthCalledWith(1, {
      repositoryPath: dispatchRepository.path,
      branchName: laneBranchName,
      startPoint: "proposal-commit",
      forceUpdate: true,
    });
    expect(pushLaneBranchMock).toHaveBeenCalledWith({
      repositoryPath: threadWorktreePath,
      branchName: laneBranchName,
      commitHash: "proposal-commit",
    });
    await vi.waitFor(() => {
      expect(pendingCoderRun).toHaveBeenCalledTimes(1);
    });

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
    expect(thread?.dispatchAssignments[0]?.lanes[0]?.proposalCommitHash).toBe("proposal-commit");
  });

  it("recovers a missing proposal branch from planner worktree proposal files that still exist on disk", async () => {
    const threadId = "8e193d06-2586-498d-864c-e8f47231dcee";
    const branchPrefix = "trace-paths";
    const canonicalBranchName = buildCanonicalBranchName({
      threadId,
      branchPrefix,
      assignmentNumber: 1,
    });
    const laneBranchName = buildLaneBranchName({
      threadId,
      branchPrefix,
      assignmentNumber: 1,
      laneIndex: 1,
    });
    const repositoryPath = path.join(tempDirectory, "repository");
    const worktreeRoot = path.join(repositoryPath, teamConfig.dispatch.worktreeRoot);
    const plannerWorktreePath = path.join(worktreeRoot, "meow-1");
    const proposalPath =
      "openspec/changes/trace-paths-a1-p1-narrow-server-file-tracing-path-resolution";
    const proposalArtifactPath = `${proposalPath}/.openspec.yaml`;
    const pendingCoderRun = vi.fn(
      () => new Promise<Awaited<ReturnType<TeamRoleDependencies["coderAgent"]["run"]>>>(() => {}),
    ) as TeamRoleDependencies["coderAgent"]["run"];

    await mkdir(path.join(plannerWorktreePath, proposalPath), {
      recursive: true,
    });
    await writeFile(
      path.join(plannerWorktreePath, proposalArtifactPath),
      "name: trace-paths-a1-p1-narrow-server-file-tracing-path-resolution\n",
      "utf8",
    );

    getBranchHeadMock
      .mockRejectedValueOnce(
        new Error(
          `fatal: ambiguous argument '${canonicalBranchName}': unknown revision or path not in the working tree.`,
        ),
      )
      .mockRejectedValueOnce(
        new Error(
          `fatal: ambiguous argument '${laneBranchName}': unknown revision or path not in the working tree.`,
        ),
      )
      .mockResolvedValueOnce("main-commit")
      .mockResolvedValueOnce("proposal-commit");
    commitContainsPathMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    findCommitContainingPathInReflogMock.mockResolvedValue(null);
    pushLaneBranchMock.mockResolvedValueOnce({
      ...basePushedCommit,
      commitHash: "proposal-commit",
      commitUrl: "https://github.com/example/meow-team/commit/proposal-commit",
    });
    synchronizePullRequestMock.mockResolvedValueOnce({
      url: "https://github.com/example/meow-team/pull/42",
    });

    const threadRecord = createDispatchThreadRecord({
      threadId,
      assignment: createDispatchAssignment({
        assignmentNumber: 1,
        repository: {
          ...dispatchRepository,
          path: repositoryPath,
        },
        status: "awaiting_human_approval",
        requestTitle: "Ship the feature",
        conventionalTitle: null,
        requestText: "Implement the approved proposal.",
        plannerSummary: "Planner summary",
        plannerDeliverable: "Planner deliverable",
        branchPrefix,
        canonicalBranchName: null,
        workerCount: 1,
        threadSlot: 1,
        plannerWorktreePath,
        lanes: [
          createProposalApprovalLane({
            branchName: laneBranchName,
            proposalChangeName: "trace-paths-a1-p1-narrow-server-file-tracing-path-resolution",
            proposalPath,
          }),
        ],
      }),
      runStatus: "awaiting_human_approval",
    });
    threadRecord.data.threadWorktree = createManagedPlanningWorktree(repositoryPath, 1);
    await writeStoredThreadRecord(threadRecord);

    await approveLaneProposal({
      env: createExecutionEnv({
        coderRun: pendingCoderRun,
      }),
      threadId,
      assignmentNumber: 1,
      laneId: "lane-1",
    });

    expect(commitWorktreeChangesMock).toHaveBeenCalledWith({
      worktreePath: plannerWorktreePath,
      message: `planner: recover proposal snapshot for ${laneBranchName}`,
      pathspecs: [proposalPath],
    });
    expect(ensureBranchRefMock).toHaveBeenNthCalledWith(1, {
      repositoryPath,
      branchName: laneBranchName,
      startPoint: "proposal-commit",
      forceUpdate: true,
    });
    await vi.waitFor(() => {
      expect(pendingCoderRun).toHaveBeenCalledTimes(1);
    });

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, threadId);
    expect(thread?.dispatchAssignments[0]?.lanes[0]?.proposalCommitHash).toBe("proposal-commit");
  });

  it("keeps the tracking PR in conflict state when auto-rebase fails and starts a conflict-resolution retry", async () => {
    let secondCoderStarted = false;
    const secondCoderPromise = new Promise<
      Awaited<ReturnType<TeamRoleDependencies["coderAgent"]["run"]>>
    >(() => undefined);
    const coderRun = vi
      .fn<TeamRoleDependencies["coderAgent"]["run"]>()
      .mockResolvedValueOnce({
        summary: "Implemented the approved proposal.",
        deliverable: "Implementation is ready for machine review.",
        decision: "continue",
        pullRequestTitle: null,
        pullRequestSummary: null,
      })
      .mockImplementationOnce(() => {
        secondCoderStarted = true;
        return secondCoderPromise;
      }) as TeamRoleDependencies["coderAgent"]["run"];
    const reviewerRun = vi.fn(async () => ({
      summary: "Machine review approved the branch.",
      deliverable: "Implementation looks correct.",
      decision: "approved" as const,
      pullRequestTitle: "Ship the feature",
      pullRequestSummary: "Machine review approved the branch.",
    })) as TeamRoleDependencies["reviewerAgent"]["run"];

    getBranchHeadMock
      .mockResolvedValueOnce("proposal-commit")
      .mockResolvedValueOnce("review-commit")
      .mockResolvedValueOnce("review-commit");
    pushLaneBranchMock.mockResolvedValueOnce({
      ...basePushedCommit,
      commitHash: "review-commit",
      commitUrl: "https://github.com/example/meow-team/commit/review-commit",
    });
    detectBranchConflictMock.mockResolvedValueOnce(true);
    tryRebaseWorktreeBranchMock.mockResolvedValueOnce({
      applied: false,
      error: "content conflict",
    });

    await writeExecutionThreadStore({
      threadId: "thread-conflict",
      lane: createProposalApprovalLane({
        status: "queued",
        workerSlot: 1,
        worktreePath: `${path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot)}/meow-1`,
        approvalGrantedAt: FIXED_TIMESTAMP,
        queuedAt: FIXED_TIMESTAMP,
        pullRequest: createDraftTrackingPullRequest(),
      }),
      assignmentOverrides: {
        status: "running",
      },
      runStatus: "running",
    });

    await ensurePendingDispatchWork(
      createTeamRunEnv({
        dependencies: createExecutionDependencies({
          coderRun,
          reviewerRun,
        }),
      }),
      "thread-conflict",
    );

    await vi.waitFor(async () => {
      expect(secondCoderStarted).toBe(true);
      const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-conflict");
      const lane = thread?.dispatchAssignments[0]?.lanes[0];
      expect(lane?.pullRequest?.status).toBe("conflict");
      expect(lane?.requeueReason).toBe("planner_detected_conflict");
      expect(lane?.latestActivity).toContain("conflict");
      expect(lane?.pushedCommit?.commitHash).toBe("review-commit");
    });

    expect(pushLaneBranchMock).toHaveBeenCalledTimes(1);
    expect(pushLaneBranchMock).toHaveBeenCalledWith({
      repositoryPath: `${path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot)}/meow-1`,
      branchName: "requests/example/a1-proposal-1",
      commitHash: "review-commit",
    });
    expect(synchronizePullRequestMock).not.toHaveBeenCalled();
    expect(tryRebaseWorktreeBranchMock).toHaveBeenCalledWith({
      worktreePath: `${path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot)}/meow-1`,
      baseBranch: "main",
    });
  });
});

describe.sequential("approveLanePullRequest", () => {
  let originalThreadFile: string;
  let tempDirectory: string;

  const writeApprovalThreadStore = async (
    lane: TeamWorkerLaneRecord,
    assignmentOverrides: Partial<TeamDispatchAssignment> = {},
  ) => {
    const worktreeRoot = path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot);
    const assignment = createDispatchAssignment({
      assignmentNumber: 1,
      repository: dispatchRepository,
      status: "approved",
      requestTitle: assignmentOverrides.requestTitle ?? "Ship the feature",
      conventionalTitle: assignmentOverrides.conventionalTitle ?? null,
      requestText: assignmentOverrides.requestText ?? "Finalize the reviewed branch.",
      plannerSummary:
        assignmentOverrides.plannerSummary ?? "Wait for final human approval after machine review.",
      plannerDeliverable: assignmentOverrides.plannerDeliverable ?? "Planner deliverable",
      branchPrefix: assignmentOverrides.branchPrefix ?? "example",
      canonicalBranchName: assignmentOverrides.canonicalBranchName ?? "requests/example/a1",
      workerCount: assignmentOverrides.workerCount ?? 1,
      threadSlot: assignmentOverrides.threadSlot ?? 1,
      plannerWorktreePath: assignmentOverrides.plannerWorktreePath ?? `${worktreeRoot}/meow-1`,
      lanes: [lane],
    });

    await writeStoredThreadRecord(
      createDispatchThreadRecord({
        threadId: "thread-1",
        assignment,
        runStatus: "approved",
      }),
    );
  };

  const createApprovalLane = (
    overrides: Partial<TeamWorkerLaneRecord> = {},
  ): TeamWorkerLaneRecord => {
    const worktreeRoot = path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot);
    return {
      ...createDispatchLane({
        laneId: "lane-1",
        laneIndex: 1,
        status: "approved",
        branchName: "requests/example/a1-proposal-1",
        baseBranch: "main",
        taskTitle: "Ship the feature",
        taskObjective: "Archive the approved proposal and open a GitHub PR.",
        proposalChangeName: "change-1",
        proposalPath: "openspec/changes/change-1",
        worktreePath: `${worktreeRoot}/meow-1`,
        latestImplementationCommit: "review-commit",
        pushedCommit: basePushedCommit,
        latestDecision: "approved",
        latestCoderSummary: "Implemented the requested branch updates.",
        latestReviewerSummary: "Machine review approved the branch.",
        latestActivity: "Waiting for final human approval.",
        approvalRequestedAt: FIXED_TIMESTAMP,
        approvalGrantedAt: FIXED_TIMESTAMP,
        queuedAt: FIXED_TIMESTAMP,
        runCount: 1,
        pullRequest: {
          id: "pr-1",
          provider: "github",
          title: "Ship the feature",
          summary: "Machine review approved the branch.",
          branchName: "requests/example/a1-proposal-1",
          baseBranch: "main",
          status: "awaiting_human_approval",
          requestedAt: FIXED_TIMESTAMP,
          humanApprovalRequestedAt: FIXED_TIMESTAMP,
          humanApprovedAt: null,
          machineReviewedAt: FIXED_TIMESTAMP,
          updatedAt: FIXED_TIMESTAMP,
          url: "https://github.com/example/meow-team/pull/42",
        },
      }),
      ...overrides,
    };
  };

  const createArchiveDependencies = ({
    coderRun,
  }: {
    coderRun?: TeamRoleDependencies["coderAgent"]["run"];
  } = {}): TeamRoleDependencies => {
    return {
      executor: vi.fn() as TeamRoleDependencies["executor"],
      requestTitleAgent: {
        run: vi.fn(),
      },
      plannerAgent: {
        run: vi.fn(),
      },
      openSpecMaterializerAgent: {
        run: vi.fn(),
      },
      coderAgent: {
        run:
          coderRun ??
          (vi.fn(async () => ({
            summary: "Archived the approved OpenSpec change.",
            deliverable: "Final archive pass completed.",
            decision: "continue" as const,
            pullRequestTitle: null,
            pullRequestSummary: null,
          })) as TeamRoleDependencies["coderAgent"]["run"]),
      },
      reviewerAgent: {
        run: vi.fn(),
      },
      executorAgent: {
        run: vi.fn(),
      },
      executionReviewerAgent: {
        run: vi.fn(),
      },
    };
  };

  const createArchiveEnv = ({
    coderRun,
  }: {
    coderRun?: TeamRoleDependencies["coderAgent"]["run"];
  } = {}): TeamRunEnv => {
    return createTeamRunEnv({
      dependencies: createArchiveDependencies({
        coderRun,
      }),
    });
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    originalThreadFile = teamConfig.storage.threadFile;
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), "dispatch-approval-"));
    teamConfig.storage.threadFile = path.join(tempDirectory, "threads.sqlite");
    hasWorktreeChangesMock.mockResolvedValue(true);
    inspectOpenSpecChangeArchiveStateMock.mockReset();
    inspectOpenSpecChangeArchiveStateMock.mockResolvedValueOnce({
      sourcePath: "openspec/changes/change-1",
      sourceExists: true,
      archivedPath: null,
    });
    inspectOpenSpecChangeArchiveStateMock.mockResolvedValue({
      sourcePath: "openspec/changes/change-1",
      sourceExists: false,
      archivedPath: "openspec/changes/archive/2026-04-11-change-1",
    });
  });

  afterEach(async () => {
    await resetTeamThreadStorageStateCacheForTests();
    teamConfig.storage.threadFile = originalThreadFile;
    await rm(tempDirectory, {
      force: true,
      recursive: true,
    });
  });

  it("routes final approval through the coder archive pass and refreshes the existing GitHub PR", async () => {
    const coderRun = vi.fn(
      async (input: Parameters<TeamRoleDependencies["coderAgent"]["run"]>[0]) => {
        const worktreeRoot = path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot);
        expect(input.input).toContain("/opsx:archive change-1");
        expect(input.input).toContain("not in an interactive context");
        expect(input.input).toContain("TBD");
        expect(input.state.executionPhase).toBe("final_archive");
        expect(input.state.archiveCommand).toBe("/opsx:archive change-1");
        expect(input.state.archivePathContext).toBe("openspec/changes/change-1");
        expect(input.state.worktree).toEqual(
          createWorktree({
            path: `${worktreeRoot}/meow-1`,
            rootPath: worktreeRoot,
          }),
        );

        return {
          summary: "Archived the approved OpenSpec change.",
          deliverable: "Final archive pass completed.",
          decision: "continue" as const,
          pullRequestTitle: null,
          pullRequestSummary: null,
        };
      },
    );

    const worktreeRoot = path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot);
    commitWorktreeChangesMock.mockResolvedValue(undefined);
    getBranchHeadMock.mockResolvedValue("archive-commit");
    pushLaneBranchMock.mockResolvedValue({
      ...basePushedCommit,
      commitUrl: "https://github.com/example/meow-team/commit/archive-commit",
      commitHash: "archive-commit",
    });
    synchronizePullRequestMock.mockResolvedValue({
      url: "https://github.com/example/meow-team/pull/42",
    });

    await writeApprovalThreadStore(createApprovalLane());

    await approveLanePullRequest({
      env: createArchiveEnv({
        coderRun,
      }),
      threadId: "thread-1",
      assignmentNumber: 1,
      laneId: "lane-1",
      finalizationMode: "archive",
    });

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(coderRun).toHaveBeenCalledTimes(1);
    expect(ensureLaneWorktreeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        worktreePath: `${worktreeRoot}/meow-1`,
        branchName: "requests/example/a1-proposal-1",
      }),
    );
    expect(commitWorktreeChangesMock).toHaveBeenCalledWith({
      worktreePath: `${worktreeRoot}/meow-1`,
      message: "docs: archive change-1",
    });
    expect(commitWorktreeChangesMock).toHaveBeenCalledTimes(1);
    expect(synchronizePullRequestMock).toHaveBeenCalledWith({
      repositoryPath: `${worktreeRoot}/meow-1`,
      branchName: "requests/example/a1-proposal-1",
      baseBranch: "main",
      title: "Ship the feature",
      body: "Machine review approved the branch.",
      draft: false,
    });
    expect(lane?.executionPhase).toBeNull();
    expect(lane?.proposalPath).toBe("openspec/changes/archive/2026-04-11-change-1");
    expect(lane?.latestImplementationCommit).toBe("archive-commit");
    expect(lane?.latestCoderSummary).toBe("Archived the approved OpenSpec change.");
    expect(lane?.pushedCommit?.commitHash).toBe("archive-commit");
    expect(lane?.pullRequest?.provider).toBe("github");
    expect(lane?.pullRequest?.status).toBe("approved");
    expect(lane?.pullRequest?.url).toBe("https://github.com/example/meow-team/pull/42");
    expect(lane?.pullRequest?.humanApprovedAt).toBeTruthy();
    expect(lane?.worktreePath).toBe(`${worktreeRoot}/meow-1`);
    expect(
      lane?.events.some((event) => event.message.includes("Coder completed final archive pass")),
    ).toBe(true);
    expect(lane?.events.at(-2)?.message).toContain("Archived OpenSpec change");
    expect(lane?.events.at(-1)?.message).toContain("GitHub PR refreshed");
    expect(thread?.dispatchAssignments[0]?.plannerNotes.at(-1)?.message).toContain(
      "GitHub PR was refreshed",
    );
    expect(thread?.dispatchAssignments[0]?.status).toBe("completed");
    expect(thread?.run?.status).toBe("completed");
  });

  it("normalizes the final GitHub PR title from stored conventional metadata", async () => {
    commitWorktreeChangesMock.mockResolvedValue(undefined);
    getBranchHeadMock.mockResolvedValue("archive-commit");
    pushLaneBranchMock.mockResolvedValue({
      ...basePushedCommit,
      commitUrl: "https://github.com/example/meow-team/commit/archive-commit",
      commitHash: "archive-commit",
    });
    synchronizePullRequestMock.mockResolvedValue({
      url: "https://github.com/example/meow-team/pull/77",
    });

    await writeApprovalThreadStore(createApprovalLane(), {
      requestTitle: "dev(vsc/command): Ship the feature",
      conventionalTitle: {
        type: "dev",
        scope: "vsc/command",
      },
    });

    await approveLanePullRequest({
      env: createArchiveEnv(),
      threadId: "thread-1",
      assignmentNumber: 1,
      laneId: "lane-1",
      finalizationMode: "archive",
    });

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(synchronizePullRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "dev(vsc/command): Ship the feature",
      }),
    );
    expect(lane?.pullRequest?.title).toBe("dev(vsc/command): Ship the feature");
  });

  it("deletes the active OpenSpec change, pushes the branch, and refreshes the GitHub PR", async () => {
    const coderRun = vi.fn();
    getBranchHeadMock.mockResolvedValue("delete-commit");
    pushLaneBranchMock.mockResolvedValue({
      ...basePushedCommit,
      commitUrl: "https://github.com/example/meow-team/commit/delete-commit",
      commitHash: "delete-commit",
    });
    synchronizePullRequestMock.mockResolvedValue({
      url: "https://github.com/example/meow-team/pull/55",
    });

    await writeApprovalThreadStore(createApprovalLane());

    await approveLanePullRequest({
      env: createArchiveEnv({
        coderRun: coderRun as TeamRoleDependencies["coderAgent"]["run"],
      }),
      threadId: "thread-1",
      assignmentNumber: 1,
      laneId: "lane-1",
      finalizationMode: "delete",
    });

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(coderRun).not.toHaveBeenCalled();
    expect(commitWorktreeChangesMock).toHaveBeenCalledWith({
      worktreePath: `${path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot)}/meow-1`,
      message: "docs: delete change-1",
      pathspecs: ["openspec/changes/change-1"],
    });
    expect(lane?.finalizationMode).toBe("delete");
    expect(lane?.proposalDisposition).toBe("deleted");
    expect(lane?.finalizationCheckpoint).toBe("completed");
    expect(lane?.proposalPath).toBe("openspec/changes/change-1");
    expect(lane?.latestImplementationCommit).toBe("delete-commit");
    expect(lane?.pushedCommit?.commitHash).toBe("delete-commit");
    expect(lane?.latestActivity).toBe(
      "Human approval finalized the machine-reviewed branch, deleted the OpenSpec change, and refreshed the GitHub PR.",
    );
    expect(lane?.events.at(-2)?.message).toContain(
      "Deleted OpenSpec change at openspec/changes/change-1",
    );
    expect(lane?.events.at(-1)?.message).toContain("GitHub PR refreshed");
    expect(thread?.dispatchAssignments[0]?.plannerNotes.at(-1)?.message).toContain(
      "was deleted from requests/example/a1-proposal-1",
    );
  });

  it("resumes archived final approval without duplicating the human approval event", async () => {
    const coderRun = vi.fn();
    const worktreeRoot = path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot);
    hasWorktreeChangesMock.mockResolvedValue(false);
    inspectOpenSpecChangeArchiveStateMock.mockReset();
    inspectOpenSpecChangeArchiveStateMock.mockResolvedValue({
      sourcePath: "openspec/changes/change-1",
      sourceExists: false,
      archivedPath: "openspec/changes/archive/2026-04-11-change-1",
    });
    getBranchHeadMock.mockResolvedValue("archive-commit");
    pushLaneBranchMock.mockResolvedValue({
      ...basePushedCommit,
      commitUrl: "https://github.com/example/meow-team/commit/archive-commit",
      commitHash: "archive-commit",
    });
    synchronizePullRequestMock.mockResolvedValue({
      url: "https://github.com/example/meow-team/pull/88",
    });

    await writeApprovalThreadStore(
      createApprovalLane({
        proposalPath: "openspec/changes/archive/2026-04-11-change-1",
        worktreePath: null,
        latestActivity:
          "Human approved the machine-reviewed branch. Queueing the coder archive pass before refreshing the GitHub PR.",
        pullRequest: {
          id: "pr-1",
          provider: "local-ci",
          title: "Ship the feature",
          summary: "Machine review approved the branch.",
          branchName: "requests/example/a1-proposal-1",
          baseBranch: "main",
          status: "awaiting_human_approval",
          requestedAt: FIXED_TIMESTAMP,
          humanApprovalRequestedAt: FIXED_TIMESTAMP,
          humanApprovedAt: FIXED_TIMESTAMP,
          machineReviewedAt: FIXED_TIMESTAMP,
          updatedAt: FIXED_TIMESTAMP,
          url: null,
        },
        events: [
          {
            id: "event-1",
            actor: "human",
            message:
              "Human approved the machine-reviewed branch for OpenSpec archive and GitHub PR refresh.",
            createdAt: FIXED_TIMESTAMP,
          },
        ],
      }),
    );

    await approveLanePullRequest({
      env: createArchiveEnv({
        coderRun: coderRun as TeamRoleDependencies["coderAgent"]["run"],
      }),
      threadId: "thread-1",
      assignmentNumber: 1,
      laneId: "lane-1",
      finalizationMode: "archive",
    });

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(coderRun).not.toHaveBeenCalled();
    expect(commitWorktreeChangesMock).not.toHaveBeenCalled();
    expect(lane?.events.filter((event) => event.actor === "human")).toHaveLength(1);
    expect(lane?.worktreePath).toBe(`${worktreeRoot}/meow-1`);
    expect(lane?.pullRequest?.status).toBe("approved");
    expect(lane?.pullRequest?.humanApprovedAt).toBe(FIXED_TIMESTAMP);
    expect(lane?.pullRequest?.url).toBe("https://github.com/example/meow-team/pull/88");
  });

  it("resumes delete finalization after the branch push without deleting or recommitting twice", async () => {
    getBranchHeadMock.mockResolvedValue("delete-commit");
    pushLaneBranchMock.mockResolvedValue({
      ...basePushedCommit,
      commitUrl: "https://github.com/example/meow-team/commit/delete-commit",
      commitHash: "delete-commit",
    });
    synchronizePullRequestMock.mockRejectedValueOnce(new Error("gh auth token missing"));

    await writeApprovalThreadStore(createApprovalLane());

    await expect(
      approveLanePullRequest({
        env: createArchiveEnv(),
        threadId: "thread-1",
        assignmentNumber: 1,
        laneId: "lane-1",
        finalizationMode: "delete",
      }),
    ).rejects.toThrow("gh auth token missing");

    commitWorktreeChangesMock.mockClear();
    inspectOpenSpecChangeArchiveStateMock.mockReset();
    pushLaneBranchMock.mockClear();
    synchronizePullRequestMock.mockResolvedValue({
      url: "https://github.com/example/meow-team/pull/56",
    });

    await approveLanePullRequest({
      env: createArchiveEnv(),
      threadId: "thread-1",
      assignmentNumber: 1,
      laneId: "lane-1",
      finalizationMode: "delete",
    });

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(inspectOpenSpecChangeArchiveStateMock).not.toHaveBeenCalled();
    expect(commitWorktreeChangesMock).not.toHaveBeenCalled();
    expect(pushLaneBranchMock).not.toHaveBeenCalled();
    expect(lane?.finalizationMode).toBe("delete");
    expect(lane?.proposalDisposition).toBe("deleted");
    expect(lane?.finalizationCheckpoint).toBe("completed");
    expect(lane?.pullRequest?.status).toBe("approved");
    expect(lane?.pullRequest?.url).toBe("https://github.com/example/meow-team/pull/56");
  });

  it("resumes delete finalization after the deletion commit succeeds but before the checkpoint is persisted", async () => {
    getBranchHeadMock.mockRejectedValueOnce(new Error("branch head lookup failed"));

    await writeApprovalThreadStore(createApprovalLane());

    await expect(
      approveLanePullRequest({
        env: createArchiveEnv(),
        threadId: "thread-1",
        assignmentNumber: 1,
        laneId: "lane-1",
        finalizationMode: "delete",
      }),
    ).rejects.toThrow("branch head lookup failed");

    let thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-1");
    let lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(pushLaneBranchMock).not.toHaveBeenCalled();
    expect(synchronizePullRequestMock).not.toHaveBeenCalled();
    expect(lane?.proposalDisposition).toBe("deleted");
    expect(lane?.finalizationCheckpoint).toBe("artifacts_applied");
    expect(lane?.latestImplementationCommit).toBeNull();
    expect(lane?.latestActivity).toBe(
      "Final human approval deleted the OpenSpec change locally, but the branch push and GitHub PR refresh did not complete.",
    );
    expect(thread?.dispatchAssignments[0]?.plannerNotes.at(-1)?.message).toContain(
      "failed after deleting openspec/changes/change-1",
    );

    commitWorktreeChangesMock.mockClear();
    inspectOpenSpecChangeArchiveStateMock.mockReset();
    getBranchHeadMock.mockReset();
    getBranchHeadMock.mockResolvedValue("delete-commit");
    pushLaneBranchMock.mockResolvedValue({
      ...basePushedCommit,
      commitUrl: "https://github.com/example/meow-team/commit/delete-commit",
      commitHash: "delete-commit",
    });
    synchronizePullRequestMock.mockResolvedValue({
      url: "https://github.com/example/meow-team/pull/57",
    });

    await approveLanePullRequest({
      env: createArchiveEnv(),
      threadId: "thread-1",
      assignmentNumber: 1,
      laneId: "lane-1",
      finalizationMode: "delete",
    });

    thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-1");
    lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(inspectOpenSpecChangeArchiveStateMock).not.toHaveBeenCalled();
    expect(commitWorktreeChangesMock).not.toHaveBeenCalled();
    expect(pushLaneBranchMock).toHaveBeenCalledTimes(1);
    expect(pushLaneBranchMock).toHaveBeenCalledWith({
      repositoryPath: `${path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot)}/meow-1`,
      branchName: "requests/example/a1-proposal-1",
      commitHash: "delete-commit",
    });
    expect(lane?.finalizationCheckpoint).toBe("completed");
    expect(lane?.pullRequest?.status).toBe("approved");
    expect(lane?.pullRequest?.url).toBe("https://github.com/example/meow-team/pull/57");
  });

  it("records an archive failure when the coder pass leaves the change unarchived", async () => {
    inspectOpenSpecChangeArchiveStateMock.mockReset();
    inspectOpenSpecChangeArchiveStateMock.mockResolvedValue({
      sourcePath: "openspec/changes/change-1",
      sourceExists: true,
      archivedPath: null,
    });
    hasWorktreeChangesMock.mockResolvedValue(false);

    await writeApprovalThreadStore(createApprovalLane());

    await expect(
      approveLanePullRequest({
        env: createArchiveEnv(),
        threadId: "thread-1",
        assignmentNumber: 1,
        laneId: "lane-1",
        finalizationMode: "archive",
      }),
    ).rejects.toThrow("Final archive coder pass did not archive OpenSpec change change-1.");

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(pushLaneBranchMock).not.toHaveBeenCalled();
    expect(synchronizePullRequestMock).not.toHaveBeenCalled();
    expect(lane?.proposalPath).toBe("openspec/changes/change-1");
    expect(lane?.pushedCommit?.commitHash).toBe("review-commit");
    expect(lane?.pullRequest?.status).toBe("failed");
    expect(lane?.lastError).toContain("did not archive OpenSpec change change-1");
    expect(thread?.dispatchAssignments[0]?.status).toBe("failed");
    expect(thread?.run?.status).toBe("failed");
  });

  it("persists archive progress when GitHub PR creation fails after the branch push", async () => {
    commitWorktreeChangesMock.mockResolvedValue(undefined);
    getBranchHeadMock.mockResolvedValue("archive-commit");
    pushLaneBranchMock.mockResolvedValue({
      ...basePushedCommit,
      commitUrl: "https://github.com/example/meow-team/commit/archive-commit",
      commitHash: "archive-commit",
    });
    synchronizePullRequestMock.mockRejectedValue(new Error("gh auth token missing"));

    await writeApprovalThreadStore(createApprovalLane());

    await expect(
      approveLanePullRequest({
        env: createArchiveEnv(),
        threadId: "thread-1",
        assignmentNumber: 1,
        laneId: "lane-1",
        finalizationMode: "archive",
      }),
    ).rejects.toThrow("gh auth token missing");

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(lane?.proposalPath).toBe("openspec/changes/archive/2026-04-11-change-1");
    expect(lane?.latestImplementationCommit).toBe("archive-commit");
    expect(lane?.pushedCommit?.commitHash).toBe("archive-commit");
    expect(lane?.pullRequest?.status).toBe("failed");
    expect(lane?.pullRequest?.humanApprovedAt).toBeTruthy();
    expect(lane?.lastError).toContain("gh auth token missing");
    expect(thread?.dispatchAssignments[0]?.status).toBe("failed");
    expect(thread?.run?.status).toBe("failed");
  });

  it("keeps the proposal unarchived when the coder archive commit fails", async () => {
    commitWorktreeChangesMock.mockRejectedValue(new Error("git user identity missing"));

    await writeApprovalThreadStore(createApprovalLane());

    await expect(
      approveLanePullRequest({
        env: createArchiveEnv(),
        threadId: "thread-1",
        assignmentNumber: 1,
        laneId: "lane-1",
        finalizationMode: "archive",
      }),
    ).rejects.toThrow("git user identity missing");

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(pushLaneBranchMock).not.toHaveBeenCalled();
    expect(synchronizePullRequestMock).not.toHaveBeenCalled();
    expect(lane?.proposalPath).toBe("openspec/changes/change-1");
    expect(lane?.latestImplementationCommit).toBe("review-commit");
    expect(lane?.pushedCommit?.commitHash).toBe("review-commit");
    expect(lane?.pullRequest?.status).toBe("failed");
    expect(lane?.pullRequest?.humanApprovedAt).toBeTruthy();
    expect(lane?.latestActivity).toBe(
      "Final human approval failed before the coder archive pass and GitHub PR refresh could complete.",
    );
    expect(lane?.lastError).toContain("git user identity missing");
    expect(thread?.dispatchAssignments[0]?.plannerNotes.at(-1)?.message).toBe(
      "Final approval for proposal 1 failed: git user identity missing",
    );
    expect(thread?.dispatchAssignments[0]?.status).toBe("failed");
    expect(thread?.run?.status).toBe("failed");
  });

  it("fails delete finalization when the proposal is already archived", async () => {
    await writeApprovalThreadStore(
      createApprovalLane({
        proposalPath: "openspec/changes/archive/2026-04-11-change-1",
        proposalDisposition: "archived",
      }),
    );

    await expect(
      approveLanePullRequest({
        env: createArchiveEnv(),
        threadId: "thread-1",
        assignmentNumber: 1,
        laneId: "lane-1",
        finalizationMode: "delete",
      }),
    ).rejects.toThrow("already archived");

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(lane?.pullRequest?.status).toBe("failed");
    expect(lane?.lastError).toContain("already archived");
  });

  it("fails archive finalization when the proposal is already deleted", async () => {
    await writeApprovalThreadStore(
      createApprovalLane({
        finalizationMode: "delete",
        proposalDisposition: "deleted",
        finalizationCheckpoint: "branch_pushed",
        pullRequest: {
          id: "pr-1",
          provider: "local-ci",
          title: "Ship the feature",
          summary: "Machine review approved the branch.",
          branchName: "requests/example/a1-proposal-1",
          baseBranch: "main",
          status: "failed",
          requestedAt: FIXED_TIMESTAMP,
          humanApprovalRequestedAt: FIXED_TIMESTAMP,
          humanApprovedAt: FIXED_TIMESTAMP,
          machineReviewedAt: FIXED_TIMESTAMP,
          updatedAt: FIXED_TIMESTAMP,
          url: null,
        },
      }),
    );

    await expect(
      approveLanePullRequest({
        env: createArchiveEnv(),
        threadId: "thread-1",
        assignmentNumber: 1,
        laneId: "lane-1",
        finalizationMode: "archive",
      }),
    ).rejects.toThrow("already deleted");

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(lane?.pullRequest?.status).toBe("failed");
    expect(lane?.lastError).toContain("already deleted");
  });
});
