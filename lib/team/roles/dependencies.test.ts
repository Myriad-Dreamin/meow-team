import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineTeamConfig } from "@/lib/config/team";
import {
  resetTeamConfigLoaderForTests,
  setTeamConfigOverrideForTests,
} from "@/lib/config/team-loader";

const { runCodexStructuredOutputMock } = vi.hoisted(() => ({
  runCodexStructuredOutputMock: vi.fn(),
}));

vi.mock("@/lib/agent/codex-cli", () => ({
  runCodexStructuredOutput: runCodexStructuredOutputMock,
}));

import type { TeamRoleDependencies } from "./dependencies";
import { createWorktree } from "@/lib/team/coding/worktree";
import { resolveTeamRoleDependencies } from "./dependencies";

const createTestTeamConfig = () => {
  return defineTeamConfig({
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
      threadFile: "/tmp/team-thread.json",
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
      roots: [
        {
          id: "test-root",
          label: "Test Root",
          directory: "/tmp",
        },
      ],
    },
  });
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
};

describe("resolveTeamRoleDependencies", () => {
  let teamConfig = createTestTeamConfig();

  beforeEach(() => {
    resetTeamConfigLoaderForTests();
    teamConfig = createTestTeamConfig();
    setTeamConfigOverrideForTests(teamConfig);
    runCodexStructuredOutputMock.mockReset();
  });

  it("shares the default queued Codex executor across dependency resolutions", async () => {
    const first = createDeferred<{
      title: string;
      conventionalTitle: null;
    }>();
    const second = createDeferred<{
      title: string;
      conventionalTitle: null;
    }>();
    const deferredByPath = new Map([
      ["/tmp/meow-1", first],
      ["/tmp/meow-2", second],
    ]);
    const started: string[] = [];
    let activeCount = 0;
    let maxActiveCount = 0;

    runCodexStructuredOutputMock.mockImplementation(
      async ({ worktree }: { worktree: { path: string } }) => {
        const deferred = deferredByPath.get(worktree.path);
        if (!deferred) {
          throw new Error(`Missing deferred executor result for ${worktree.path}.`);
        }

        started.push(worktree.path);
        activeCount += 1;
        maxActiveCount = Math.max(maxActiveCount, activeCount);

        try {
          return await deferred.promise;
        } finally {
          activeCount -= 1;
        }
      },
    );

    const firstDependencies = resolveTeamRoleDependencies();
    const secondDependencies = resolveTeamRoleDependencies();

    const firstPromise = firstDependencies.requestTitleAgent.run({
      input: "Queue the first request.",
      requestText: "Queue the first request.",
      worktree: createWorktree({ path: "/tmp/meow-1" }),
    });
    const secondPromise = secondDependencies.requestTitleAgent.run({
      input: "Queue the second request.",
      requestText: "Queue the second request.",
      worktree: createWorktree({ path: "/tmp/meow-2" }),
    });

    expect(firstDependencies.executor).toBe(secondDependencies.executor);

    await vi.waitFor(() => {
      expect(runCodexStructuredOutputMock).toHaveBeenCalledTimes(1);
    });
    expect(started).toEqual(["/tmp/meow-1"]);

    first.resolve({
      title: "First title",
      conventionalTitle: null,
    });
    await expect(firstPromise).resolves.toEqual({
      title: "First title",
      conventionalTitle: null,
    });

    await vi.waitFor(() => {
      expect(runCodexStructuredOutputMock).toHaveBeenCalledTimes(2);
    });
    expect(started).toEqual(["/tmp/meow-1", "/tmp/meow-2"]);

    second.resolve({
      title: "Second title",
      conventionalTitle: null,
    });
    await expect(secondPromise).resolves.toEqual({
      title: "Second title",
      conventionalTitle: null,
    });
    expect(maxActiveCount).toBe(1);
  });

  it("rebuilds the shared queued executor when workerCount changes", async () => {
    const first = createDeferred<{
      title: string;
      conventionalTitle: null;
    }>();
    const second = createDeferred<{
      title: string;
      conventionalTitle: null;
    }>();
    const third = createDeferred<{
      title: string;
      conventionalTitle: null;
    }>();
    const fourth = createDeferred<{
      title: string;
      conventionalTitle: null;
    }>();
    const deferredByPath = new Map([
      ["/tmp/meow-1", first],
      ["/tmp/meow-2", second],
      ["/tmp/meow-3", third],
      ["/tmp/meow-4", fourth],
    ]);

    runCodexStructuredOutputMock.mockImplementation(
      async ({ worktree }: { worktree: { path: string } }) => {
        const deferred = deferredByPath.get(worktree.path);
        if (!deferred) {
          throw new Error(`Missing deferred executor result for ${worktree.path}.`);
        }

        return deferred.promise;
      },
    );

    const firstDependencies = resolveTeamRoleDependencies();
    const firstPromise = firstDependencies.requestTitleAgent.run({
      input: "Queue the first request.",
      requestText: "Queue the first request.",
      worktree: createWorktree({ path: "/tmp/meow-1" }),
    });
    const secondPromise = firstDependencies.requestTitleAgent.run({
      input: "Queue the second request.",
      requestText: "Queue the second request.",
      worktree: createWorktree({ path: "/tmp/meow-2" }),
    });

    await vi.waitFor(() => {
      expect(runCodexStructuredOutputMock).toHaveBeenCalledTimes(1);
    });

    first.resolve({
      title: "First title",
      conventionalTitle: null,
    });
    await expect(firstPromise).resolves.toEqual({
      title: "First title",
      conventionalTitle: null,
    });

    await vi.waitFor(() => {
      expect(runCodexStructuredOutputMock).toHaveBeenCalledTimes(2);
    });

    second.resolve({
      title: "Second title",
      conventionalTitle: null,
    });
    await expect(secondPromise).resolves.toEqual({
      title: "Second title",
      conventionalTitle: null,
    });

    teamConfig.dispatch.workerCount = 2;

    const secondDependencies = resolveTeamRoleDependencies();
    expect(secondDependencies.executor).not.toBe(firstDependencies.executor);

    const thirdPromise = secondDependencies.requestTitleAgent.run({
      input: "Queue the third request.",
      requestText: "Queue the third request.",
      worktree: createWorktree({ path: "/tmp/meow-3" }),
    });
    const fourthPromise = secondDependencies.requestTitleAgent.run({
      input: "Queue the fourth request.",
      requestText: "Queue the fourth request.",
      worktree: createWorktree({ path: "/tmp/meow-4" }),
    });

    await vi.waitFor(() => {
      expect(runCodexStructuredOutputMock).toHaveBeenCalledTimes(4);
    });

    third.resolve({
      title: "Third title",
      conventionalTitle: null,
    });
    fourth.resolve({
      title: "Fourth title",
      conventionalTitle: null,
    });

    await expect(thirdPromise).resolves.toEqual({
      title: "Third title",
      conventionalTitle: null,
    });
    await expect(fourthPromise).resolves.toEqual({
      title: "Fourth title",
      conventionalTitle: null,
    });
  });

  it("builds default agent instances from an injected executor", async () => {
    const executor = vi.fn(async ({ codexHomePrefix }: { codexHomePrefix: string }) => {
      if (codexHomePrefix === "openspec-materializer") {
        return {
          summary: "Materialized artifacts.",
          deliverable: "Wrote the OpenSpec proposal files.",
          artifactsCreated: ["openspec/changes/change-1/proposal.md"],
        };
      }

      if (codexHomePrefix === "lane") {
        return {
          summary: "Execution lane ready.",
          deliverable: "Committed the execution artifacts.",
          decision: "continue",
          pullRequestTitle: null,
          pullRequestSummary: null,
        };
      }

      return {
        title: "Injected Title",
        conventionalTitle: null,
      };
    }) as unknown as TeamRoleDependencies["executor"];

    const dependencies = resolveTeamRoleDependencies({
      executor,
    });

    await expect(
      dependencies.requestTitleAgent.run({
        input: "Ship reliable dispatch coordination.",
        requestText: "Ship reliable dispatch coordination.",
        worktree: createWorktree({ path: "/tmp/meow-team" }),
      }),
    ).resolves.toEqual({
      title: "Injected Title",
      conventionalTitle: null,
    });
    await expect(
      dependencies.openSpecMaterializerAgent.run({
        worktree: createWorktree({ path: "/tmp/meow-team" }),
        state: {
          repositoryPath: "/tmp/meow-team",
          canonicalBranchName: "requests/example/a1",
          proposalBranchName: "requests/example/a1-proposal-1",
          proposalChangeName: "change-1",
          proposalPath: "openspec/changes/change-1",
          requestTitle: "feat(dispatch): Materialize proposal artifacts",
          conventionalTitle: {
            type: "feat",
            scope: "dispatch",
          },
          taskTitle: "Materialize proposal artifacts",
          taskObjective: "Write proposal files from the dedicated agent.",
          plannerSummary: "Planner summary",
          plannerDeliverable: "Planner deliverable",
          requestInput: "Materialize the planner proposal artifacts.",
          worktreeRoot: "/tmp/team-worktrees",
        },
      }),
    ).resolves.toEqual({
      summary: "Materialized artifacts.",
      deliverable: "Wrote the OpenSpec proposal files.",
      artifactsCreated: ["openspec/changes/change-1/proposal.md"],
    });

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        worktree: createWorktree({ path: "/tmp/meow-team" }),
        codexHomePrefix: "request-title",
      }),
    );
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        worktree: createWorktree({ path: "/tmp/meow-team" }),
        codexHomePrefix: "openspec-materializer",
      }),
    );
    await expect(
      dependencies.executorAgent.run({
        input: "Run the execution lane.",
        state: {
          repository: {
            id: "repo",
            name: "meow-team",
            rootId: "root",
            rootLabel: "Root",
            path: "/tmp/meow-team",
            relativePath: ".",
          },
          branchName: "requests/example/a1-proposal-1",
          baseBranch: "main",
          worktree: createWorktree({ path: "/tmp/meow-team" }),
          implementationCommit: null,
          teamName: "Test Team",
          ownerName: "Owner",
          objective: "Ship reliable GitHub delivery.",
          laneId: "lane-1",
          laneIndex: 1,
          executionPhase: "implementation",
          executionMode: "execution",
          executionModeLabel: "execution",
          taskTitle: "Run fixture refresh script",
          taskObjective: "Refresh fixtures with a validator and summary.",
          requestTitle: "feat(team/executing): introduce execute mode workflow",
          conventionalTitle: {
            type: "feat",
            scope: "team/executing",
          },
          planSummary: "Route execute-mode work through executor lanes.",
          planDeliverable: "Proposal: Add execute-mode workflow and roles",
          conflictNote: null,
          archiveCommand: null,
          archivePathContext: "openspec/changes/change-1",
          guideInstructions: "Inspect AGENTS.md for execution guidance before making changes.",
          artifactContract:
            "Execution artifact contract for execution lanes:\n- Commit the scripts or automation changes that perform the run.",
          workflow: ["executor", "execution-reviewer"],
          handoffs: {},
          handoffCounter: 0,
          assignmentNumber: 1,
        },
      }),
    ).resolves.toEqual({
      summary: "Execution lane ready.",
      deliverable: "Committed the execution artifacts.",
      decision: "continue",
      pullRequestTitle: null,
      pullRequestSummary: null,
    });
    expect(runCodexStructuredOutputMock).not.toHaveBeenCalled();
  });

  it("keeps explicit agent overrides intact", () => {
    const requestTitleAgent = {
      run: vi.fn(),
    };
    const openSpecMaterializerAgent = {
      run: vi.fn(),
    };
    const executorAgent = {
      run: vi.fn(),
    };
    const executionReviewerAgent = {
      run: vi.fn(),
    };

    const dependencies = resolveTeamRoleDependencies({
      requestTitleAgent,
      openSpecMaterializerAgent,
      executorAgent,
      executionReviewerAgent,
    });

    expect(dependencies.requestTitleAgent).toBe(requestTitleAgent);
    expect(dependencies.openSpecMaterializerAgent).toBe(openSpecMaterializerAgent);
    expect(dependencies.executorAgent).toBe(executorAgent);
    expect(dependencies.executionReviewerAgent).toBe(executionReviewerAgent);
  });
});
