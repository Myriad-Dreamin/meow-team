import { z } from "zod";
import type { Worktree } from "@/lib/team/coding/worktree";
import type { TeamCodexEvent } from "@/lib/team/types";

export type TeamStructuredExecutorInput<TSchema extends z.ZodTypeAny> = {
  worktree: Worktree;
  prompt: string;
  responseSchema: TSchema;
  codexHomePrefix: string;
  onEvent?: (event: TeamCodexEvent) => Promise<void> | void;
};

export type TeamStructuredExecutor = <TSchema extends z.ZodTypeAny>(
  input: TeamStructuredExecutorInput<TSchema>,
) => Promise<z.infer<TSchema>>;

type QueuedTeamStructuredExecution = {
  start: () => void;
};

const assertExecutorConcurrency = (concurrency: number): void => {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Team structured executor concurrency must be a positive integer.");
  }
};

export const createQueuedTeamStructuredExecutor = ({
  executor,
  concurrency,
}: {
  executor: TeamStructuredExecutor;
  concurrency: number;
}): TeamStructuredExecutor => {
  assertExecutorConcurrency(concurrency);

  let activeCount = 0;
  const pendingExecutions: QueuedTeamStructuredExecution[] = [];

  const startNextExecutions = (): void => {
    while (activeCount < concurrency) {
      const nextExecution = pendingExecutions.shift();
      if (!nextExecution) {
        return;
      }

      activeCount += 1;
      nextExecution.start();
    }
  };

  const queuedExecutor: TeamStructuredExecutor = <TSchema extends z.ZodTypeAny>(
    input: TeamStructuredExecutorInput<TSchema>,
  ): Promise<z.infer<TSchema>> => {
    return new Promise<z.infer<TSchema>>((resolve, reject) => {
      const start = (): void => {
        void Promise.resolve()
          .then(() => executor(input))
          .then(resolve, reject)
          .finally(() => {
            activeCount -= 1;
            startNextExecutions();
          });
      };

      pendingExecutions.push({ start });
      startNextExecutions();
    });
  };

  return queuedExecutor;
};
