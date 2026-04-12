import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  approveLanePullRequestMock,
  createPlannerDispatchAssignmentMock,
  ensurePendingDispatchWorkMock,
  findConfiguredRepositoryMock,
  queueLaneProposalForExecutionMock,
} = vi.hoisted(() => {
  return {
    approveLanePullRequestMock: vi.fn(),
    createPlannerDispatchAssignmentMock: vi.fn(),
    ensurePendingDispatchWorkMock: vi.fn(),
    findConfiguredRepositoryMock: vi.fn(),
    queueLaneProposalForExecutionMock: vi.fn(),
  };
});

vi.mock("@/lib/team/dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/team/dispatch")>();

  return {
    ...actual,
    approveLanePullRequest: approveLanePullRequestMock,
    createPlannerDispatchAssignment: createPlannerDispatchAssignmentMock,
    ensurePendingDispatchWork: ensurePendingDispatchWorkMock,
    queueLaneProposalForExecution: queueLaneProposalForExecutionMock,
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
import {
  getTeamThreadRecord,
  updateTeamThreadRecord,
  upsertTeamThreadRun,
} from "@/lib/team/history";
import {
  createInitialTeamRunState,
  createTeamRunEnv,
  persistTeamRunState,
  runTeam,
} from "@/lib/team/network";
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

const createPersistStateMock = () => vi.fn(async () => undefined);

const createReplayLane = (overrides: Partial<TeamWorkerLaneRecord> = {}): TeamWorkerLaneRecord => ({
  laneId: "lane-1",
  laneIndex: 1,
  status: "awaiting_human_approval",
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
  await writeFile(
    teamConfig.storage.threadFile,
    JSON.stringify(
      {
        threads: {
          [threadId]: {
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
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
};

describe.sequential("runTeam", () => {
  let originalThreadFile: string;
  let originalWorkerCount: number;
  let tempDirectory: string;

  beforeEach(async () => {
    originalThreadFile = teamConfig.storage.threadFile;
    originalWorkerCount = teamConfig.dispatch.workerCount;
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), "run-team-"));
    teamConfig.storage.threadFile = path.join(tempDirectory, "threads.json");

    createPlannerDispatchAssignmentMock.mockReset();
    createPlannerDispatchAssignmentMock.mockResolvedValue({} as never);
    approveLanePullRequestMock.mockReset();
    approveLanePullRequestMock.mockResolvedValue(undefined);
    ensurePendingDispatchWorkMock.mockReset();
    ensurePendingDispatchWorkMock.mockResolvedValue(undefined);
    findConfiguredRepositoryMock.mockReset();
    findConfiguredRepositoryMock.mockResolvedValue(null);
    queueLaneProposalForExecutionMock.mockReset();
    queueLaneProposalForExecutionMock.mockResolvedValue(undefined);
  });

  afterEach(async () => {
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
    expect(createPlannerDispatchAssignmentMock).toHaveBeenCalledWith({
      threadId: "thread-1",
      assignmentNumber: 1,
      repository,
      requestTitle: "dev(dispatch/coordination): stabilize dispatch flow",
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
    expect(ensurePendingDispatchWorkMock).toHaveBeenCalledWith({
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
    expect(createPlannerDispatchAssignmentMock).toHaveBeenCalledWith({
      threadId: "thread-stale-conventional-title",
      assignmentNumber: 1,
      repository,
      requestTitle: "dev(dispatch/coordination): stabilize dispatch flow",
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
    expect(createPlannerDispatchAssignmentMock).not.toHaveBeenCalled();
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
    expect(createPlannerDispatchAssignmentMock).not.toHaveBeenCalled();
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

    createPlannerDispatchAssignmentMock.mockImplementationOnce(async (input) => {
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
    expect(createPlannerDispatchAssignmentMock).toHaveBeenCalledTimes(1);
    expect(ensurePendingDispatchWorkMock).toHaveBeenCalledTimes(2);

    const thread = await getTeamThreadRecord(teamConfig.storage.threadFile, "thread-replay");
    expect(thread?.dispatchAssignments).toHaveLength(1);
    expect(thread?.results).toHaveLength(1);
    expect(thread?.data.requestTitle).toBe("dev(dispatch/coordination): stabilize dispatch flow");
  });

  it("fails fast when all shared meow slots are already assigned to active threads", async () => {
    teamConfig.dispatch.workerCount = 1;
    findConfiguredRepositoryMock.mockResolvedValue(repository);

    await writeFile(
      teamConfig.storage.threadFile,
      JSON.stringify(
        {
          threads: {
            "active-thread": {
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
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

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
    expect(createPlannerDispatchAssignmentMock).not.toHaveBeenCalled();
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

    queueLaneProposalForExecutionMock.mockImplementationOnce(
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

    expect(queueLaneProposalForExecutionMock).toHaveBeenCalledTimes(1);
    expect(ensurePendingDispatchWorkMock).toHaveBeenCalledTimes(2);

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
    expect(queueLaneProposalForExecutionMock).toHaveBeenCalledWith({
      threadId: "thread-approval",
      assignmentNumber: 2,
      laneId: "lane-3",
    });
    expect(ensurePendingDispatchWorkMock).toHaveBeenCalledWith({
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
    expect(approveLanePullRequestMock).toHaveBeenCalledWith({
      threadId: "thread-finalize",
      assignmentNumber: 4,
      laneId: "lane-2",
    });
    expect(queueLaneProposalForExecutionMock).not.toHaveBeenCalled();
    expect(ensurePendingDispatchWorkMock).not.toHaveBeenCalled();
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

    expect(approveLanePullRequestMock).not.toHaveBeenCalled();
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
    expect(ensurePendingDispatchWorkMock).toHaveBeenCalledWith({
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
