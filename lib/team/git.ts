import "server-only";

import { createHash } from "node:crypto";
import path from "node:path";
import { runGit } from "@/lib/cli-tools/git";
import {
  ensureWorktreeCheckout,
  listExistingBranches,
  listGitWorktrees,
  removeWorktreeDirectory,
} from "@/lib/git/ops";
import { publishBranch } from "@/lib/platform";
import type { TeamPushedCommitRecord } from "@/lib/team/types";

export class ExistingBranchesRequireDeleteError extends Error {
  branchNames: string[];

  constructor(branchNames: string[]) {
    const uniqueBranchNames = Array.from(
      new Set(
        branchNames
          .map((branchName) => branchName.trim())
          .filter((branchName): branchName is string => branchName.length > 0),
      ),
    );
    const formattedBranches = uniqueBranchNames.map((branchName) => `- ${branchName}`).join("\n");

    super(
      [
        "The planner found existing branches that must be deleted before this assignment can be rematerialized:",
        formattedBranches,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    this.name = "ExistingBranchesRequireDeleteError";
    this.branchNames = uniqueBranchNames;
  }
}

const isPathInsideRoot = (candidatePath: string, rootPath: string): boolean => {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
};

export const deleteManagedBranches = async ({
  repositoryPath,
  worktreeRoot,
  branchNames,
}: {
  repositoryPath: string;
  worktreeRoot: string;
  branchNames: string[];
}): Promise<void> => {
  const existingBranches = await listExistingBranches({
    repositoryPath,
    branchNames,
  });

  if (existingBranches.length === 0) {
    return;
  }

  const targetBranches = new Set(existingBranches);
  const worktrees = await listGitWorktrees(repositoryPath);
  const blockingWorktrees = worktrees.filter((worktree) => {
    if (!worktree.branchName || !targetBranches.has(worktree.branchName)) {
      return false;
    }

    return (
      worktree.worktreePath === repositoryPath ||
      !isPathInsideRoot(worktree.worktreePath, worktreeRoot)
    );
  });

  if (blockingWorktrees.length > 0) {
    const blockingDetails = blockingWorktrees
      .map((worktree) => `${worktree.branchName} -> ${worktree.worktreePath}`)
      .join(", ");
    throw new Error(
      `Unable to delete the existing branch selection because it is checked out outside the managed worktree root: ${blockingDetails}. Switch those worktrees away from the branch before retrying.`,
    );
  }

  const managedWorktrees = worktrees.filter((worktree) => {
    if (!worktree.branchName || !targetBranches.has(worktree.branchName)) {
      return false;
    }

    return (
      worktree.worktreePath !== repositoryPath &&
      isPathInsideRoot(worktree.worktreePath, worktreeRoot)
    );
  });

  for (const worktree of managedWorktrees) {
    await runGit(repositoryPath, ["worktree", "remove", "--force", worktree.worktreePath]);
    await removeWorktreeDirectory(worktree.worktreePath);
  }

  if (managedWorktrees.length > 0) {
    await runGit(repositoryPath, ["worktree", "prune"]);
  }

  for (const branchName of existingBranches) {
    await runGit(repositoryPath, ["branch", "-D", branchName]);
  }
};

export const sanitizeBranchSegment = (value: string): string => {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9/-]+/g, "-")
      .replace(/\/+/g, "/")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/^\/+|\/+$/g, "") || "assignment"
  );
};

const buildThreadBranchSegment = (threadId: string): string => {
  const readableSegment = sanitizeBranchSegment(threadId).replace(/\//g, "-").slice(0, 24);
  const threadHash = createHash("sha256").update(threadId).digest("hex").slice(0, 16);
  return readableSegment ? `${readableSegment}-${threadHash}` : `thread-${threadHash}`;
};

export const buildCanonicalBranchName = ({
  threadId,
  branchPrefix,
  assignmentNumber,
}: {
  threadId: string;
  branchPrefix: string;
  assignmentNumber: number;
}): string => {
  const sanitizedPrefix = sanitizeBranchSegment(branchPrefix);
  return `requests/${sanitizedPrefix}/${buildThreadBranchSegment(threadId)}/a${assignmentNumber}`;
};

export const buildLaneBranchName = ({
  threadId,
  branchPrefix,
  assignmentNumber,
  laneIndex,
}: {
  threadId: string;
  branchPrefix: string;
  assignmentNumber: number;
  laneIndex: number;
}): string => {
  const sanitizedPrefix = sanitizeBranchSegment(branchPrefix);
  return `requests/${sanitizedPrefix}/${buildThreadBranchSegment(threadId)}/a${assignmentNumber}-proposal-${laneIndex}`;
};

export const resolveWorktreeRoot = ({
  repositoryPath,
  worktreeRoot,
}: {
  repositoryPath: string;
  worktreeRoot: string;
}): string => {
  return path.isAbsolute(worktreeRoot) ? worktreeRoot : path.join(repositoryPath, worktreeRoot);
};

const buildManagedWorktreePath = ({
  worktreeRoot,
  slot,
}: {
  worktreeRoot: string;
  slot: number;
}): string => {
  return path.join(worktreeRoot, `meow-${slot}`);
};

export const buildLaneWorktreePath = ({
  worktreeRoot,
  laneIndex,
}: {
  worktreeRoot: string;
  laneIndex: number;
}): string => {
  return buildManagedWorktreePath({
    worktreeRoot,
    slot: laneIndex,
  });
};

export const buildPlannerWorktreePath = ({
  worktreeRoot,
  threadSlot,
}: {
  worktreeRoot: string;
  threadSlot: number;
}): string => {
  return buildManagedWorktreePath({
    worktreeRoot,
    slot: threadSlot,
  });
};

export const parseManagedWorktreeSlot = ({
  worktreeRoot,
  worktreePath,
}: {
  worktreeRoot: string;
  worktreePath: string;
}): number | null => {
  const relativePath = path.relative(worktreeRoot, worktreePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  const normalizedRelativePath = relativePath.split(path.sep).join("/");
  const match = /^meow-(\d+)$/u.exec(normalizedRelativePath);
  if (!match) {
    return null;
  }

  const slot = Number.parseInt(match[1] ?? "", 10);
  return Number.isSafeInteger(slot) && slot > 0 ? slot : null;
};

export const ensureLaneWorktree = async ({
  repositoryPath,
  worktreeRoot,
  worktreePath,
  branchName,
  startPoint,
}: {
  repositoryPath: string;
  worktreeRoot?: string;
  worktreePath: string;
  branchName: string;
  startPoint: string;
}): Promise<void> => {
  await ensureWorktreeCheckout({
    repositoryPath,
    worktreeRoot,
    worktreePath,
    branchName,
    startPoint,
  });
};

export const pushLaneBranch = async ({
  repositoryPath,
  branchName,
  commitHash,
  remoteName,
  pushedAt,
}: {
  repositoryPath: string;
  branchName: string;
  commitHash: string;
  remoteName?: string;
  pushedAt?: string;
}): Promise<TeamPushedCommitRecord> => {
  return publishBranch({
    repositoryPath,
    branchName,
    commitHash,
    remoteName,
    pushedAt,
  });
};

export const resolvePushedCommitForHead = ({
  commitHash,
  pushedCommit,
}: {
  commitHash: string | null | undefined;
  pushedCommit: TeamPushedCommitRecord | null | undefined;
}): TeamPushedCommitRecord | null => {
  if (!commitHash || !pushedCommit || pushedCommit.commitHash !== commitHash) {
    return null;
  }

  return pushedCommit;
};

export type PublishLaneBranchHeadResult = {
  published: boolean;
  pushedCommit: TeamPushedCommitRecord;
};

export const publishLaneBranchHead = async ({
  repositoryPath,
  branchName,
  commitHash,
  pushedCommit,
  remoteName,
  pushedAt,
}: {
  repositoryPath: string;
  branchName: string;
  commitHash: string;
  pushedCommit?: TeamPushedCommitRecord | null;
  remoteName?: string;
  pushedAt?: string;
}): Promise<PublishLaneBranchHeadResult> => {
  const matchingPushedCommit = resolvePushedCommitForHead({
    commitHash,
    pushedCommit,
  });

  if (matchingPushedCommit) {
    return {
      published: false,
      pushedCommit: matchingPushedCommit,
    };
  }

  return {
    published: true,
    pushedCommit: await pushLaneBranch({
      repositoryPath,
      branchName,
      commitHash,
      remoteName,
      pushedAt,
    }),
  };
};
