import { createThreadWorkspaceDescriptor, createThreadWorkspaceRows } from "./thread-workspaces.js";
import {
  isSqliteConstraintError,
  type ThreadOccupation,
  type ThreadOccupationStore,
} from "./thread-occupation-store.js";

export type ThreadWorkspaceAllocation = {
  readonly threadId: string;
  readonly repositoryRoot: string;
  readonly slotNumber: number;
  readonly workspaceRelativePath: string;
  readonly workspaceAbsolutePath: string;
  readonly occupation: ThreadOccupation;
};

export class ExistingThreadOccupationError extends Error {
  constructor(threadId: string, occupation: ThreadOccupation) {
    super(
      `Thread id ${threadId} is already running in ${occupation.workspaceRelativePath} for repository ${occupation.repositoryRoot}.`,
    );
    this.name = "ExistingThreadOccupationError";
  }
}

export class NoIdleThreadWorkspaceError extends Error {
  constructor(repositoryRoot: string) {
    super(`No idle thread workspace is available for repository ${repositoryRoot}.`);
    this.name = "NoIdleThreadWorkspaceError";
  }
}

export class ThreadWorkspaceOccupiedError extends Error {
  constructor(repositoryRoot: string, workspaceRelativePath: string) {
    super(
      `A thread is already running in workspace ${workspaceRelativePath} for repository ${repositoryRoot}.`,
    );
    this.name = "ThreadWorkspaceOccupiedError";
  }
}

export function allocateThreadWorkspace(input: {
  readonly store: ThreadOccupationStore;
  readonly repositoryRoot: string;
  readonly registeredWorktrees: ReadonlySet<string>;
  readonly maxConcurrentWorkers: number;
  readonly threadId: string;
  readonly requestBody: string;
}): ThreadWorkspaceAllocation {
  const existingOccupation = input.store.readOccupationByThreadId(input.threadId);

  if (existingOccupation !== null) {
    throw new ExistingThreadOccupationError(input.threadId, existingOccupation);
  }

  const occupations = input.store.readOccupationsByRepository(input.repositoryRoot);
  const rows = createThreadWorkspaceRows({
    repositoryRoot: input.repositoryRoot,
    registeredWorktrees: input.registeredWorktrees,
    maxConcurrentWorkers: input.maxConcurrentWorkers,
    occupations,
  });
  const candidate = rows.find((row) => row.status === "idle");

  if (!candidate) {
    throw new NoIdleThreadWorkspaceError(input.repositoryRoot);
  }

  try {
    const occupation = input.store.insertRunningOccupation({
      threadId: input.threadId,
      repositoryRoot: input.repositoryRoot,
      slotNumber: candidate.slotNumber,
      workspaceRelativePath: candidate.relativePath,
      requestBody: input.requestBody,
    });

    return {
      threadId: input.threadId,
      repositoryRoot: input.repositoryRoot,
      slotNumber: candidate.slotNumber,
      workspaceRelativePath: candidate.relativePath,
      workspaceAbsolutePath: candidate.absolutePath,
      occupation,
    };
  } catch (error) {
    if (!isSqliteConstraintError(error)) {
      throw error;
    }

    const concurrentThreadOccupation = input.store.readOccupationByThreadId(input.threadId);

    if (concurrentThreadOccupation !== null) {
      throw new ExistingThreadOccupationError(input.threadId, concurrentThreadOccupation);
    }

    const concurrentWorkspaceOccupation = input.store.readOccupationByRepositorySlot(
      input.repositoryRoot,
      candidate.slotNumber,
    );

    if (concurrentWorkspaceOccupation !== null) {
      const workspace = createThreadWorkspaceDescriptor(input.repositoryRoot, candidate.slotNumber);

      throw new ThreadWorkspaceOccupiedError(input.repositoryRoot, workspace.relativePath);
    }

    throw error;
  }
}
