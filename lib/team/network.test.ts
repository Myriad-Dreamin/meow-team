import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createPlannerDispatchAssignmentMock,
  ensurePendingDispatchWorkMock,
  findConfiguredRepositoryMock,
} = vi.hoisted(() => {
  return {
    createPlannerDispatchAssignmentMock: vi.fn(),
    ensurePendingDispatchWorkMock: vi.fn(),
    findConfiguredRepositoryMock: vi.fn(),
  };
});

vi.mock("@/lib/team/dispatch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/team/dispatch")>();

  return {
    ...actual,
    createPlannerDispatchAssignment: createPlannerDispatchAssignmentMock,
    ensurePendingDispatchWork: ensurePendingDispatchWorkMock,
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
import { getTeamThreadRecord } from "@/lib/team/history";
import { runTeam } from "@/lib/team/network";
import type { TeamRepositoryOption } from "@/lib/team/repository-types";
import type { TeamRoleDependencies } from "@/lib/team/roles/dependencies";

type RequestTitleRoleArgs = Parameters<TeamRoleDependencies["requestTitleRole"]>;
type PlannerRoleArgs = Parameters<TeamRoleDependencies["plannerRole"]>;

const repository: TeamRepositoryOption = {
  id: "repo-1",
  name: "meow-team",
  rootId: "root-1",
  rootLabel: "Workspace",
  path: process.cwd(),
  relativePath: ".",
};

describe.sequential("runTeam", () => {
  let originalThreadFile: string;
  let tempDirectory: string;

  beforeEach(async () => {
    originalThreadFile = teamConfig.storage.threadFile;
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), "run-team-"));
    teamConfig.storage.threadFile = path.join(tempDirectory, "threads.json");

    createPlannerDispatchAssignmentMock.mockReset();
    createPlannerDispatchAssignmentMock.mockResolvedValue({} as never);
    ensurePendingDispatchWorkMock.mockReset();
    ensurePendingDispatchWorkMock.mockResolvedValue(undefined);
    findConfiguredRepositoryMock.mockReset();
    findConfiguredRepositoryMock.mockResolvedValue(null);
  });

  afterEach(async () => {
    teamConfig.storage.threadFile = originalThreadFile;
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

    const requestTitleRoleMock = vi.fn(
      async (input: RequestTitleRoleArgs[0], receivedExecutor: RequestTitleRoleArgs[1]) => {
      callOrder.push("request-title");
      expect(receivedExecutor).toBe(executor);
      expect(input).toMatchObject({
        input: "Ship reliable dispatch coordination.",
        requestText: "Ship reliable dispatch coordination.",
        worktreePath: repository.path,
      });

      return {
        title: "Dispatch Coordination",
      };
      },
    );
    const plannerRoleMock = vi.fn(
      async (input: PlannerRoleArgs[0], receivedExecutor: PlannerRoleArgs[1]) => {
      callOrder.push("planner");
      expect(receivedExecutor).toBe(executor);
      expect(input.state.requestTitle).toBe("Dispatch Coordination");
      expect(input.state.selectedRepository).toEqual(repository);

      return {
        handoff: {
          summary: "Planner summary",
          deliverable: "Planner deliverable",
          decision: "continue",
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
      },
    );
    const coderRoleMock = vi.fn();
    const reviewerRoleMock = vi.fn();

    const result = await runTeam({
      input: "Ship reliable dispatch coordination.",
      repositoryId: repository.id,
      threadId: "thread-1",
      dependencies: {
        executor,
        requestTitleRole:
          requestTitleRoleMock as unknown as TeamRoleDependencies["requestTitleRole"],
        plannerRole: plannerRoleMock as unknown as TeamRoleDependencies["plannerRole"],
        coderRole: coderRoleMock as unknown as TeamRoleDependencies["coderRole"],
        reviewerRole: reviewerRoleMock as unknown as TeamRoleDependencies["reviewerRole"],
      },
    });

    expect(callOrder).toEqual(["request-title", "planner"]);
    expect(executorMock).not.toHaveBeenCalled();
    expect(requestTitleRoleMock).toHaveBeenCalledTimes(1);
    expect(plannerRoleMock).toHaveBeenCalledTimes(1);
    expect(coderRoleMock).not.toHaveBeenCalled();
    expect(reviewerRoleMock).not.toHaveBeenCalled();
    expect(createPlannerDispatchAssignmentMock).toHaveBeenCalledWith({
      threadId: "thread-1",
      assignmentNumber: 1,
      repository,
      requestTitle: "Dispatch Coordination",
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
        requestTitleRole:
          requestTitleRoleMock as unknown as TeamRoleDependencies["requestTitleRole"],
        plannerRole: plannerRoleMock as unknown as TeamRoleDependencies["plannerRole"],
        coderRole: coderRoleMock as unknown as TeamRoleDependencies["coderRole"],
        reviewerRole: reviewerRoleMock as unknown as TeamRoleDependencies["reviewerRole"],
      }),
    });
    expect(result.requestTitle).toBe("Dispatch Coordination");
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
    expect(thread?.data.requestTitle).toBe("Dispatch Coordination");
    expect(thread?.data.requestText).toBe("Ship reliable dispatch coordination.");
    expect(thread?.data.handoffs.planner?.summary).toBe("Planner summary");
    expect(thread?.results).toHaveLength(1);
  });

  it("reuses a provided title and skips request-title generation when dispatch is blocked", async () => {
    const executorMock = vi.fn(async () => {
      throw new Error("executor should not be called");
    });
    const executor = executorMock as unknown as TeamRoleDependencies["executor"];

    const requestTitleRoleMock = vi.fn();
    const plannerRoleMock = vi.fn(
      async (input: PlannerRoleArgs[0], receivedExecutor: PlannerRoleArgs[1]) => {
      expect(receivedExecutor).toBe(executor);
      expect(input.state.requestTitle).toBe("Human Title");
      expect(input.state.selectedRepository).toBeNull();

      return {
        handoff: {
          summary: "Planner is waiting for a repository",
          deliverable: "Select a repository before proposal dispatch can continue.",
          decision: "continue",
        },
        dispatch: null,
      };
      },
    );
    const coderRoleMock = vi.fn();
    const reviewerRoleMock = vi.fn();

    const result = await runTeam({
      input: "Plan the request.",
      title: "Human Title",
      threadId: "thread-2",
      dependencies: {
        executor,
        requestTitleRole:
          requestTitleRoleMock as unknown as TeamRoleDependencies["requestTitleRole"],
        plannerRole: plannerRoleMock as unknown as TeamRoleDependencies["plannerRole"],
        coderRole: coderRoleMock as unknown as TeamRoleDependencies["coderRole"],
        reviewerRole: reviewerRoleMock as unknown as TeamRoleDependencies["reviewerRole"],
      },
    });

    expect(requestTitleRoleMock).not.toHaveBeenCalled();
    expect(plannerRoleMock).toHaveBeenCalledTimes(1);
    expect(executorMock).not.toHaveBeenCalled();
    expect(createPlannerDispatchAssignmentMock).not.toHaveBeenCalled();
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
});
