import type { TeamRepositoryOption } from "@/lib/git/repository";
import { resolveWorktreeRoot } from "@/lib/team/git";
import type { TeamRunState } from "@/lib/team/coding/shared";
import { resolveManagedWorktree, type Worktree } from "@/lib/team/coding/worktree";
import type { TeamDispatchAssignment } from "@/lib/team/types";

type ThreadOwnedWorktreeCandidate = {
  threadWorktree?: TeamRunState["threadWorktree"];
  dispatchAssignments: TeamDispatchAssignment[];
};

export type ThreadOwnedWorktreeClaim = {
  threadId: string;
  worktree: Worktree | null;
};

const sortAssignmentsNewestFirst = (
  assignments: TeamDispatchAssignment[],
): TeamDispatchAssignment[] => {
  return [...assignments].sort((left, right) => right.assignmentNumber - left.assignmentNumber);
};

const resolveAssignmentWorktree = ({
  assignment,
  rootPath,
}: {
  assignment: TeamDispatchAssignment;
  rootPath: string;
}): Worktree | null => {
  const assignmentWorktree = resolveManagedWorktree({
    rootPath,
    path: assignment.plannerWorktreePath,
    slot: assignment.threadSlot,
  });
  if (assignmentWorktree?.slot) {
    return assignmentWorktree;
  }

  for (const lane of assignment.lanes) {
    const laneWorktree = resolveManagedWorktree({
      rootPath,
      path: lane.worktreePath,
      slot: lane.workerSlot,
    });
    if (laneWorktree?.slot) {
      return laneWorktree;
    }
  }

  return null;
};

export const resolveRepositoryManagedWorktreeRoot = ({
  repositoryPath,
  configuredWorktreeRoot,
}: {
  repositoryPath: string;
  configuredWorktreeRoot: string;
}): string => {
  return resolveWorktreeRoot({
    repositoryPath,
    worktreeRoot: configuredWorktreeRoot,
  });
};

export const resolveThreadOwnedWorktree = ({
  repository,
  configuredWorktreeRoot,
  candidate,
}: {
  repository: TeamRepositoryOption | null;
  configuredWorktreeRoot: string;
  candidate: ThreadOwnedWorktreeCandidate;
}): Worktree | null => {
  if (!repository) {
    return null;
  }

  const rootPath = resolveRepositoryManagedWorktreeRoot({
    repositoryPath: repository.path,
    configuredWorktreeRoot,
  });

  const normalizedThreadWorktree = resolveManagedWorktree({
    rootPath,
    path: candidate.threadWorktree?.path,
    slot: candidate.threadWorktree?.slot,
  });
  if (normalizedThreadWorktree?.slot) {
    return normalizedThreadWorktree;
  }

  for (const assignment of sortAssignmentsNewestFirst(candidate.dispatchAssignments)) {
    const assignmentWorktree = resolveAssignmentWorktree({
      assignment,
      rootPath,
    });
    if (assignmentWorktree?.slot) {
      return assignmentWorktree;
    }
  }

  return null;
};

export const claimThreadOwnedWorktree = ({
  repository,
  configuredWorktreeRoot,
  currentWorktree,
  livingClaims,
  workerCount,
}: {
  repository: TeamRepositoryOption;
  configuredWorktreeRoot: string;
  currentWorktree: Worktree | null;
  livingClaims: ThreadOwnedWorktreeClaim[];
  workerCount: number;
}): Worktree | null => {
  if (currentWorktree?.slot) {
    return currentWorktree;
  }

  const occupiedSlots = new Set<number>();
  for (const claim of livingClaims) {
    if (claim.worktree?.slot && claim.worktree.slot >= 1 && claim.worktree.slot <= workerCount) {
      occupiedSlots.add(claim.worktree.slot);
    }
  }

  const rootPath = resolveRepositoryManagedWorktreeRoot({
    repositoryPath: repository.path,
    configuredWorktreeRoot,
  });

  for (let slot = 1; slot <= workerCount; slot += 1) {
    if (occupiedSlots.has(slot)) {
      continue;
    }

    return resolveManagedWorktree({
      rootPath,
      slot,
    });
  }

  return null;
};

export const applyThreadOwnedWorktreeToAssignment = ({
  assignment,
  worktree,
}: {
  assignment: TeamDispatchAssignment;
  worktree: Worktree | null;
}): void => {
  assignment.threadSlot = worktree?.slot ?? null;
  assignment.plannerWorktreePath = worktree?.path ?? null;
};
