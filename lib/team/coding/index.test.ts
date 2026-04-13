import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  commitWorktreeChangesMock,
  detectBranchConflictMock,
  deleteManagedBranchesMock,
  ensureLaneWorktreeMock,
  findConfiguredRepositoryMock,
  getBranchHeadMock,
  hasWorktreeChangesMock,
  inspectOpenSpecChangeArchiveStateMock,
  listExistingBranchesMock,
  materializeAssignmentProposalsMock,
  pushLaneBranchMock,
  resolveRepositoryBaseBranchMock,
  synchronizePullRequestMock,
  tryRebaseWorktreeBranchMock,
} = vi.hoisted(() => {
  return {
    commitWorktreeChangesMock: vi.fn(),
    detectBranchConflictMock: vi.fn(),
    deleteManagedBranchesMock: vi.fn(),
    ensureLaneWorktreeMock: vi.fn(),
    findConfiguredRepositoryMock: vi.fn(),
    getBranchHeadMock: vi.fn(),
    hasWorktreeChangesMock: vi.fn(),
    inspectOpenSpecChangeArchiveStateMock: vi.fn(),
    listExistingBranchesMock: vi.fn(),
    materializeAssignmentProposalsMock: vi.fn(),
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
    commitWorktreeChanges: commitWorktreeChangesMock,
    detectBranchConflict: detectBranchConflictMock,
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
import * as historyModule from "@/lib/team/history";
import {
  getTeamThreadRecord,
  type PendingDispatchAssignment,
  type TeamThreadRecord,
  updateTeamThreadRecord,
  upsertTeamThreadRun,
} from "@/lib/team/history";
import {
  approveLaneProposal,
  approveLanePullRequest,
  assignPendingDispatchThreadSlots,
  assignPendingDispatchWorkerSlots,
  createInitialTeamRunState,
  createPlannerDispatchAssignment,
  createTeamRunEnv,
  ensurePendingDispatchWork,
  persistTeamRunState,
  prepareAssignmentReplan,
  runTeam,
  teamNetworkDispatchOps,
  TeamThreadReplanError,
  type TeamRunEnv,
} from "@/lib/team/coding";
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
const createPlannerDispatchAssignmentSpy = vi.spyOn(
  teamNetworkDispatchOps,
  "createPlannerDispatchAssignment",
);
const approveLaneProposalSpy = vi.spyOn(teamNetworkDispatchOps, "approveLaneProposal");
const approveLanePullRequestSpy = vi.spyOn(teamNetworkDispatchOps, "approveLanePullRequest");
const ensurePendingDispatchWorkSpy = vi.spyOn(teamNetworkDispatchOps, "ensurePendingDispatchWork");

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

const createPersistStateMock = () => vi.fn<TeamRunEnv["persistState"]>(async () => undefined);

const createReplayLane = (overrides: Partial<TeamWorkerLaneRecord> = {}): TeamWorkerLaneRecord => ({
  laneId: "lane-1",
  laneIndex: 1,
  status: "awaiting_human_approval",
  executionPhase: null,
  taskTitle: "Replay task",
  taskObjective: "Replay the persisted stage safely.",
  proposalChangeName: "replay-change",
  proposalPath: "openspec/changes/replay-change",
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

    createPlannerDispatchAssignmentSpy.mockReset();
    createPlannerDispatchAssignmentSpy.mockResolvedValue({} as never);
    approveLaneProposalSpy.mockReset();
    approveLaneProposalSpy.mockResolvedValue(undefined);
    approveLanePullRequestSpy.mockReset();
    approveLanePullRequestSpy.mockResolvedValue(undefined);
    ensurePendingDispatchWorkSpy.mockReset();
    ensurePendingDispatchWorkSpy.mockResolvedValue(undefined);
    findConfiguredRepositoryMock.mockReset();
    findConfiguredRepositoryMock.mockResolvedValue(null);
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
            worktreePath: repository.path,
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
          worktreePath: repository.path,
          tasks: [
            {
              title: "Stabilize dispatch flow",
              objective: "Inject role dependencies into the scheduler.",
            },
          ],
        });

        return {
          title: "Dispatch Coordination",
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

    expect(callOrder).toEqual(["request-title:initial", "planner", "request-title:metadata"]);
    expect(executorMock).not.toHaveBeenCalled();
    expect(requestTitleAgentMock.run).toHaveBeenCalledTimes(2);
    expect(plannerAgentMock.run).toHaveBeenCalledTimes(1);
    expect(coderAgentMock.run).not.toHaveBeenCalled();
    expect(reviewerAgentMock.run).not.toHaveBeenCalled();
    expect(createPlannerDispatchAssignmentSpy).toHaveBeenCalledWith({
      threadId: "thread-1",
      assignmentNumber: 1,
      repository,
      requestTitle: "dev(dispatch/coordination): Stabilize dispatch flow",
      conventionalTitle: {
        type: "dev",
        scope: "dispatch/coordination",
      },
      requestText: "Ship reliable dispatch coordination.",
      plannerSummary: "Plan summary",
      plannerDeliverable: "Plan deliverable",
      branchPrefix: "dispatch-coordination",
      tasks: [
        {
          title: "Stabilize dispatch flow",
          objective: "Inject role dependencies into the scheduler.",
        },
      ],
      deleteExistingBranches: undefined,
    });
    expect(ensurePendingDispatchWorkSpy).toHaveBeenCalledWith({
      threadId: "thread-1",
      dependencies: expect.objectContaining({
        executor,
        requestTitleAgent: requestTitleAgentMock,
        plannerAgent: plannerAgentMock,
        coderAgent: coderAgentMock,
        reviewerAgent: reviewerAgentMock,
      }),
    });
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
    expect(result.requestTitle).toBe("dev(dispatch/coordination): Stabilize dispatch flow");
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
    expect(thread?.data.requestTitle).toBe("dev(dispatch/coordination): Stabilize dispatch flow");
    expect(thread?.data.conventionalTitle).toEqual({
      type: "dev",
      scope: "dispatch/coordination",
    });
    expect(thread?.data.requestText).toBe("Ship reliable dispatch coordination.");
    expect(thread?.data.handoffs.planner?.summary).toBe("Planner summary");
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
          title: "Dispatch Coordination",
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
    expect(createPlannerDispatchAssignmentSpy).toHaveBeenCalledWith({
      threadId: "thread-stale-conventional-title",
      assignmentNumber: 1,
      repository,
      requestTitle: "dev(dispatch/coordination): Stabilize dispatch flow",
      conventionalTitle: {
        type: "dev",
        scope: "dispatch/coordination",
      },
      requestText: "Ship reliable dispatch coordination.",
      plannerSummary: "Plan summary",
      plannerDeliverable: "Plan deliverable",
      branchPrefix: "dispatch-coordination",
      tasks: [
        {
          title: "Stabilize dispatch flow",
          objective: "Inject role dependencies into the scheduler.",
        },
      ],
      deleteExistingBranches: undefined,
    });
    expect(persistStateMock.mock.calls.map(([state]) => state.stage)).toEqual([
      "init",
      "planning",
      "metadata-generation",
      "reviewing",
      "completed",
    ]);
    expect(result?.requestTitle).toBe("dev(dispatch/coordination): Stabilize dispatch flow");

    const thread = await getTeamThreadRecord(
      teamConfig.storage.threadFile,
      "thread-stale-conventional-title",
    );
    expect(thread?.data.requestTitle).toBe("dev(dispatch/coordination): Stabilize dispatch flow");
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
    expect(createPlannerDispatchAssignmentSpy).not.toHaveBeenCalled();
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
        latestInput: "Plan the persisted request.",
        forceReset: false,
      },
      input: "Plan the persisted request.",
    });

    const requestTitleAgentMock = { run: vi.fn() };
    const plannerAgentMock = {
      run: vi.fn(async (input: PlannerAgentArgs[0]): Promise<PlannerAgentResult> => {
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
          worktreePath: process.cwd(),
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
    expect(createPlannerDispatchAssignmentSpy).not.toHaveBeenCalled();
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
    const requestTitleAgentMock = {
      run: vi.fn(async () => {
        return {
          title: "Dispatch Coordination",
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

    createPlannerDispatchAssignmentSpy.mockImplementationOnce(async (input) => {
      await updateTeamThreadRecord({
        threadFile: teamConfig.storage.threadFile,
        threadId: input.threadId,
        updater: (thread) => {
          thread.dispatchAssignments = [
            createReplayAssignment(
              createReplayLane({
                laneId: "lane-1",
                taskTitle: input.tasks[0]?.title ?? "Replay task",
                taskObjective: input.tasks[0]?.objective ?? "Replay the persisted stage safely.",
                branchName: "requests/dispatch-coordination/a1-proposal-1",
              }),
              {
                assignmentNumber: input.assignmentNumber,
                repository,
                requestTitle: input.requestTitle,
                conventionalTitle: input.conventionalTitle ?? null,
                requestText: input.requestText,
                plannerSummary: input.plannerSummary,
                plannerDeliverable: input.plannerDeliverable,
                branchPrefix: input.branchPrefix,
                canonicalBranchName: "requests/dispatch-coordination/a1",
              },
            ),
          ];
        },
      });

      return {} as never;
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

    expect(requestTitleAgentMock.run).toHaveBeenCalledTimes(1);
    expect(createPlannerDispatchAssignmentSpy).toHaveBeenCalledTimes(1);
    expect(ensurePendingDispatchWorkSpy).toHaveBeenCalledTimes(2);

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-replay");
    expect(thread?.dispatchAssignments).toHaveLength(1);
    expect(thread?.results).toHaveLength(1);
    expect(thread?.data.requestTitle).toBe("dev(dispatch/coordination): Stabilize dispatch flow");
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
      "All 1 shared meow worktree slot is already assigned to non-terminal threads.",
    );

    expect(requestTitleAgentMock.run).not.toHaveBeenCalled();
    expect(plannerAgentMock.run).not.toHaveBeenCalled();
    expect(createPlannerDispatchAssignmentSpy).not.toHaveBeenCalled();
    expect(persistStateMock.mock.calls.map(([state]) => state.stage)).toEqual(["init"]);
  });

  it("does not replay coding-stage queueing when resuming the same persisted stage", async () => {
    const persistStateMock = createPersistStateMock();
    const env = createTeamRunEnv({
      persistState: persistStateMock,
    });

    await writeReplayThreadStore({
      threadId: "thread-coding-replay",
      assignmentNumber: 2,
      lane: createReplayLane({
        laneId: "lane-3",
        branchName: "requests/replay/a2-proposal-1",
      }),
      assignmentOverrides: {
        assignmentNumber: 2,
        canonicalBranchName: "requests/replay/a2",
        requestTitle: "Replay Queueing",
        requestText: "Queue the lane once.",
      },
    });

    approveLaneProposalSpy.mockImplementationOnce(
      async ({
        threadId,
        assignmentNumber,
        laneId,
      }: {
        threadId: string;
        assignmentNumber: number;
        laneId: string;
      }) => {
        await updateTeamThreadRecord({
          threadFile: teamConfig.storage.threadFile,
          threadId,
          updater: (thread) => {
            const assignment = thread.dispatchAssignments.find(
              (candidate) => candidate.assignmentNumber === assignmentNumber,
            );
            const lane = assignment?.lanes.find((candidate) => candidate.laneId === laneId);
            if (!assignment || !lane) {
              throw new Error("Expected a persisted lane to queue.");
            }

            lane.status = "queued";
            lane.approvalGrantedAt = FIXED_TIMESTAMP;
            lane.queuedAt = FIXED_TIMESTAMP;
            lane.updatedAt = FIXED_TIMESTAMP;
          },
        });
      },
    );

    const persistedStage = {
      stage: "coding",
      args: {
        kind: "proposal-approval",
        threadId: "thread-coding-replay",
        assignmentNumber: 2,
        laneId: "lane-3",
      },
    } satisfies Parameters<typeof runTeam>[1];

    await runTeam(env, structuredClone(persistedStage));
    await runTeam(env, structuredClone(persistedStage));

    expect(approveLaneProposalSpy).toHaveBeenCalledTimes(1);
    expect(ensurePendingDispatchWorkSpy).toHaveBeenCalledTimes(2);

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-coding-replay");
    expect(thread?.dispatchAssignments[0]?.lanes[0]?.status).toBe("queued");
  });

  it("routes proposal approval through coding and reviewing stages", async () => {
    const persistStateMock = createPersistStateMock();
    const env = createTeamRunEnv({
      persistState: persistStateMock,
    });
    const initialState = createInitialTeamRunState({
      kind: "proposal-approval",
      threadId: "thread-approval",
      assignmentNumber: 2,
      laneId: "lane-3",
    });
    await persistTeamRunState(env, initialState);

    const result = await runTeam(env, initialState);

    expect(result).toBeNull();
    expect(approveLaneProposalSpy).toHaveBeenCalledWith({
      threadId: "thread-approval",
      assignmentNumber: 2,
      laneId: "lane-3",
      dependencies: expect.objectContaining({
        requestTitleAgent: expect.any(Object),
        plannerAgent: expect.any(Object),
        coderAgent: expect.any(Object),
        reviewerAgent: expect.any(Object),
      }),
    });
    expect(ensurePendingDispatchWorkSpy).toHaveBeenCalledWith({
      threadId: "thread-approval",
      dependencies: expect.objectContaining({
        requestTitleAgent: expect.any(Object),
        plannerAgent: expect.any(Object),
        coderAgent: expect.any(Object),
        reviewerAgent: expect.any(Object),
      }),
    });
    expect(persistStateMock.mock.calls.map(([state]) => state.stage)).toEqual([
      "init",
      "coding",
      "reviewing",
      "completed",
    ]);
  });

  it("routes final approval through the archiving stage", async () => {
    const persistStateMock = createPersistStateMock();
    const env = createTeamRunEnv({
      persistState: persistStateMock,
    });
    const initialState = createInitialTeamRunState({
      kind: "pull-request-approval",
      threadId: "thread-finalize",
      assignmentNumber: 4,
      laneId: "lane-2",
    });
    await persistTeamRunState(env, initialState);

    const result = await runTeam(env, initialState);

    expect(result).toBeNull();
    expect(approveLanePullRequestSpy).toHaveBeenCalledWith({
      threadId: "thread-finalize",
      assignmentNumber: 4,
      laneId: "lane-2",
      dependencies: expect.objectContaining({
        requestTitleAgent: expect.any(Object),
        plannerAgent: expect.any(Object),
        coderAgent: expect.any(Object),
        reviewerAgent: expect.any(Object),
      }),
    });
    expect(approveLaneProposalSpy).not.toHaveBeenCalled();
    expect(ensurePendingDispatchWorkSpy).not.toHaveBeenCalled();
    expect(persistStateMock.mock.calls.map(([state]) => state.stage)).toEqual([
      "init",
      "archiving",
      "completed",
    ]);
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
      },
    } satisfies Parameters<typeof runTeam>[1];

    await runTeam(env, structuredClone(persistedStage));
    await runTeam(env, structuredClone(persistedStage));

    expect(approveLanePullRequestSpy).not.toHaveBeenCalled();
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
    expect(ensurePendingDispatchWorkSpy).toHaveBeenCalledWith({
      threadId: "thread-dispatch",
      dependencies: expect.objectContaining({
        requestTitleAgent: expect.any(Object),
        plannerAgent: expect.any(Object),
        coderAgent: expect.any(Object),
        reviewerAgent: expect.any(Object),
      }),
    });
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
    const threadStore: Record<string, TeamThreadRecord> = {
      "thread-1": createDispatchThreadRecord({
        threadId: "thread-1",
        assignment: createDispatchAssignment({
          assignmentNumber: 1,
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
    expect(lane?.worktreePath).toBe(
      path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot, "meow-1"),
    );
  });
});

describe.sequential("createPlannerDispatchAssignment", () => {
  let originalThreadFile: string;
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
        latestInput: plannerInput.requestText,
        forceReset: false,
      },
      input: plannerInput.requestText,
    });
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    originalThreadFile = teamConfig.storage.threadFile;
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
      ...plannerInput,
    });
    const betaAssignment = await createPlannerDispatchAssignment({
      threadId: "thread-beta",
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
      ...plannerInput,
    });
    const secondAssignment = await createPlannerDispatchAssignment({
      threadId: "thread-alpha",
      ...plannerInput,
    });

    expect(firstAssignment.canonicalBranchName).toBe(secondAssignment.canonicalBranchName);
    expect(firstAssignment.lanes[0]?.branchName).toBe(secondAssignment.lanes[0]?.branchName);
  });

  it("keeps slash-delimited conventional scope metadata out of branch namespaces", async () => {
    await writePlannerThread("thread-scope");

    const assignment = await createPlannerDispatchAssignment({
      threadId: "thread-scope",
      ...plannerInput,
    });

    expect(assignment.canonicalBranchName).toContain("parallel-worktrees");
    expect(assignment.canonicalBranchName).not.toContain("vsc/command");
    expect(assignment.lanes[0]?.proposalChangeName).not.toContain("vsc/command");
    expect(assignment.conventionalTitle).toEqual(plannerInput.conventionalTitle);
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
    };
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

  beforeEach(async () => {
    vi.clearAllMocks();
    originalThreadFile = teamConfig.storage.threadFile;
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), "dispatch-proposal-"));
    teamConfig.storage.threadFile = path.join(tempDirectory, "threads.sqlite");
    commitWorktreeChangesMock.mockResolvedValue(undefined);
    synchronizePullRequestMock.mockReset();
    detectBranchConflictMock.mockReset();
    detectBranchConflictMock.mockResolvedValue(false);
    ensureLaneWorktreeMock.mockReset();
    ensureLaneWorktreeMock.mockResolvedValue(undefined);
    getBranchHeadMock.mockReset();
    hasWorktreeChangesMock.mockReset();
    hasWorktreeChangesMock.mockResolvedValue(false);
    pushLaneBranchMock.mockReset();
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
    let resolveCoder: (
      value: Awaited<ReturnType<TeamRoleDependencies["coderAgent"]["run"]>>,
    ) => void = () => {
      throw new Error("Coder resolver was not initialized.");
    };
    const coderRun = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<TeamRoleDependencies["coderAgent"]["run"]>>>((resolve) => {
          resolveCoder = resolve;
        }),
    ) as TeamRoleDependencies["coderAgent"]["run"];
    const reviewerRun = vi.fn(async () => ({
      summary: "Machine review approved the branch.",
      deliverable: "Implementation looks correct.",
      decision: "approved" as const,
      pullRequestTitle: "Ship the feature",
      pullRequestSummary: "Machine review approved the branch.",
    })) as TeamRoleDependencies["reviewerAgent"]["run"];

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
      threadId: "thread-proposal",
      assignmentNumber: 1,
      laneId: "lane-1",
      dependencies: createExecutionDependencies({
        coderRun,
        reviewerRun,
      }),
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

    expect(synchronizePullRequestMock).toHaveBeenNthCalledWith(1, {
      repositoryPath: dispatchRepository.path,
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
      repositoryPath: dispatchRepository.path,
      branchName: "requests/example/a1-proposal-1",
      commitHash: "rebased-review-commit",
    });
    expect(synchronizePullRequestMock).toHaveBeenNthCalledWith(2, {
      repositoryPath: `${path.join(dispatchRepository.path, teamConfig.dispatch.worktreeRoot)}/meow-1`,
      branchName: "requests/example/a1-proposal-1",
      baseBranch: "main",
      title: "Ship the feature",
      body: "Machine review approved the branch.",
      draft: false,
    });
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
      .mockResolvedValueOnce("review-commit");
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

    await ensurePendingDispatchWork({
      threadId: "thread-conflict",
      dependencies: createExecutionDependencies({
        coderRun,
        reviewerRun,
      }),
    });

    await vi.waitFor(async () => {
      expect(secondCoderStarted).toBe(true);
      const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-conflict");
      const lane = thread?.dispatchAssignments[0]?.lanes[0];
      expect(lane?.pullRequest?.status).toBe("conflict");
      expect(lane?.requeueReason).toBe("planner_detected_conflict");
      expect(lane?.latestActivity).toContain("conflict");
    });

    expect(pushLaneBranchMock).not.toHaveBeenCalled();
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
    };
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
        expect(input.input).toContain("/opsx:archive change-1");
        expect(input.input).toContain("not in an interactive context");
        expect(input.input).toContain("TBD");
        expect(input.state.executionPhase).toBe("final_archive");
        expect(input.state.archiveCommand).toBe("/opsx:archive change-1");
        expect(input.state.archivePathContext).toBe("openspec/changes/change-1");

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
      threadId: "thread-1",
      assignmentNumber: 1,
      laneId: "lane-1",
      dependencies: createArchiveDependencies({
        coderRun,
      }),
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
      message: "coder: archive change-1",
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
      threadId: "thread-1",
      assignmentNumber: 1,
      laneId: "lane-1",
      dependencies: createArchiveDependencies(),
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

  it("resumes archived final approval without duplicating the human approval event", async () => {
    const coderRun = vi.fn();
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
      threadId: "thread-1",
      assignmentNumber: 1,
      laneId: "lane-1",
      dependencies: createArchiveDependencies({
        coderRun: coderRun as TeamRoleDependencies["coderAgent"]["run"],
      }),
    });

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-1");
    const lane = thread?.dispatchAssignments[0]?.lanes[0];

    expect(coderRun).not.toHaveBeenCalled();
    expect(commitWorktreeChangesMock).not.toHaveBeenCalled();
    expect(lane?.events.filter((event) => event.actor === "human")).toHaveLength(1);
    expect(lane?.pullRequest?.status).toBe("approved");
    expect(lane?.pullRequest?.humanApprovedAt).toBe(FIXED_TIMESTAMP);
    expect(lane?.pullRequest?.url).toBe("https://github.com/example/meow-team/pull/88");
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
        threadId: "thread-1",
        assignmentNumber: 1,
        laneId: "lane-1",
        dependencies: createArchiveDependencies(),
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
        threadId: "thread-1",
        assignmentNumber: 1,
        laneId: "lane-1",
        dependencies: createArchiveDependencies(),
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
        threadId: "thread-1",
        assignmentNumber: 1,
        laneId: "lane-1",
        dependencies: createArchiveDependencies(),
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
});
