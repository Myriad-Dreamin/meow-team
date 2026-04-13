import { beforeEach, describe, expect, it, vi } from "vitest";

const { runCodexStructuredOutputMock } = vi.hoisted(() => ({
  runCodexStructuredOutputMock: vi.fn(),
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
      threadFile: "/tmp/team-thread.json",
    },
    dispatch: {
      workerCount: 1,
      maxProposalCount: 6,
      branchPrefix: "team-dispatch",
      baseBranch: "main",
      worktreeRoot: "/tmp/team-worktrees",
    },
    repositories: {
      roots: [],
    },
  },
}));

vi.mock("@/lib/agent/codex-cli", () => ({
  runCodexStructuredOutput: runCodexStructuredOutputMock,
}));

import type { TeamRoleDependencies } from "./dependencies";
import { createWorktree } from "@/lib/team/coding/worktree";
import { resolveTeamRoleDependencies } from "./dependencies";

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
  beforeEach(() => {
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

  it("builds default agent instances from an injected executor", async () => {
    const executor = vi.fn(async () => {
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

    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        worktree: createWorktree({ path: "/tmp/meow-team" }),
        codexHomePrefix: "request-title",
      }),
    );
    expect(runCodexStructuredOutputMock).not.toHaveBeenCalled();
  });

  it("keeps explicit agent overrides intact", () => {
    const requestTitleAgent = {
      run: vi.fn(),
    };

    const dependencies = resolveTeamRoleDependencies({
      requestTitleAgent,
    });

    expect(dependencies.requestTitleAgent).toBe(requestTitleAgent);
  });
});
