import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import {
  createQueuedTeamStructuredExecutor,
  type TeamStructuredExecutor,
} from "@/lib/agent/executor";
import { createWorktree } from "@/lib/team/coding/worktree";

const responseSchema = z.object({
  value: z.string(),
});

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

const createExecutorInput = (worktreePath: string) => ({
  worktree: createWorktree({ path: worktreePath }),
  prompt: `Run for ${worktreePath}`,
  responseSchema,
  codexHomePrefix: "lane",
});

describe("createQueuedTeamStructuredExecutor", () => {
  it("caps concurrency and starts queued work in FIFO order", async () => {
    const first = createDeferred<{ value: string }>();
    const second = createDeferred<{ value: string }>();
    const third = createDeferred<{ value: string }>();
    const fourth = createDeferred<{ value: string }>();
    const deferredByPath = new Map([
      ["/tmp/first", first],
      ["/tmp/second", second],
      ["/tmp/third", third],
      ["/tmp/fourth", fourth],
    ]);
    const started: string[] = [];
    let activeCount = 0;
    let maxActiveCount = 0;

    const executor = vi.fn(async ({ worktree }) => {
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
    }) as unknown as TeamStructuredExecutor;

    const queuedExecutor = createQueuedTeamStructuredExecutor({
      executor,
      concurrency: 2,
    });

    const firstPromise = queuedExecutor(createExecutorInput("/tmp/first"));
    const secondPromise = queuedExecutor(createExecutorInput("/tmp/second"));
    const thirdPromise = queuedExecutor(createExecutorInput("/tmp/third"));
    const fourthPromise = queuedExecutor(createExecutorInput("/tmp/fourth"));

    await vi.waitFor(() => {
      expect(executor).toHaveBeenCalledTimes(2);
    });
    expect(started).toEqual(["/tmp/first", "/tmp/second"]);

    second.resolve({ value: "second" });

    await vi.waitFor(() => {
      expect(executor).toHaveBeenCalledTimes(3);
    });
    expect(started).toEqual(["/tmp/first", "/tmp/second", "/tmp/third"]);

    first.resolve({ value: "first" });

    await vi.waitFor(() => {
      expect(executor).toHaveBeenCalledTimes(4);
    });
    expect(started).toEqual(["/tmp/first", "/tmp/second", "/tmp/third", "/tmp/fourth"]);

    third.resolve({ value: "third" });
    fourth.resolve({ value: "fourth" });

    await expect(
      Promise.all([firstPromise, secondPromise, thirdPromise, fourthPromise]),
    ).resolves.toEqual([
      { value: "first" },
      { value: "second" },
      { value: "third" },
      { value: "fourth" },
    ]);
    expect(maxActiveCount).toBe(2);
  });

  it("propagates executor failures and frees the slot for later work", async () => {
    const first = createDeferred<{ value: string }>();
    const second = createDeferred<{ value: string }>();
    const deferredByPath = new Map([
      ["/tmp/first", first],
      ["/tmp/second", second],
    ]);
    const started: string[] = [];

    const executor = vi.fn(async ({ worktree }) => {
      const deferred = deferredByPath.get(worktree.path);
      if (!deferred) {
        throw new Error(`Missing deferred executor result for ${worktree.path}.`);
      }

      started.push(worktree.path);
      return deferred.promise;
    }) as unknown as TeamStructuredExecutor;

    const queuedExecutor = createQueuedTeamStructuredExecutor({
      executor,
      concurrency: 1,
    });

    const firstPromise = queuedExecutor(createExecutorInput("/tmp/first"));
    const secondPromise = queuedExecutor(createExecutorInput("/tmp/second"));

    await vi.waitFor(() => {
      expect(executor).toHaveBeenCalledTimes(1);
    });

    const firstFailure = expect(firstPromise).rejects.toThrow("Codex execution failed.");
    first.reject(new Error("Codex execution failed."));
    await firstFailure;

    await vi.waitFor(() => {
      expect(executor).toHaveBeenCalledTimes(2);
    });
    expect(started).toEqual(["/tmp/first", "/tmp/second"]);

    second.resolve({ value: "second" });
    await expect(secondPromise).resolves.toEqual({ value: "second" });
  });
});
