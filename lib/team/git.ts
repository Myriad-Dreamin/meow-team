import "server-only";

import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const runGit = async (
  repositoryPath: string,
  args: string[],
): Promise<{
  stdout: string;
  stderr: string;
}> => {
  try {
    const result = await execFileAsync("git", ["-C", repositoryPath, ...args], {
      maxBuffer: 1024 * 1024 * 4,
    });

    return {
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
    };

    const output = [nodeError.stderr, nodeError.stdout].filter(Boolean).join("\n").trim();
    throw new Error(output || `Git command failed in ${repositoryPath}: git ${args.join(" ")}`);
  }
};

const branchExists = async (repositoryPath: string, branchName: string): Promise<boolean> => {
  try {
    await runGit(repositoryPath, ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`]);
    return true;
  } catch {
    return false;
  }
};

export const sanitizeBranchSegment = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^\/+|\/+$/g, "") || "assignment";
};

export const buildLaneBranchName = ({
  branchPrefix,
  assignmentNumber,
  laneIndex,
}: {
  branchPrefix: string;
  assignmentNumber: number;
  laneIndex: number;
}): string => {
  const sanitizedPrefix = sanitizeBranchSegment(branchPrefix);
  return `dispatch/${sanitizedPrefix}/a${assignmentNumber}-lane-${laneIndex}`;
};

export const buildLaneWorktreePath = ({
  worktreeRoot,
  teamId,
  threadId,
  assignmentNumber,
  laneIndex,
}: {
  worktreeRoot: string;
  teamId: string;
  threadId: string;
  assignmentNumber: number;
  laneIndex: number;
}): string => {
  return path.join(
    worktreeRoot,
    sanitizeBranchSegment(teamId),
    threadId,
    `assignment-${assignmentNumber}`,
    `lane-${laneIndex}`,
  );
};

export const resolveRepositoryBaseBranch = async (
  repositoryPath: string,
  preferredBranch: string,
): Promise<string> => {
  try {
    await runGit(repositoryPath, ["rev-parse", "--verify", preferredBranch]);
    return preferredBranch;
  } catch {
    const { stdout } = await runGit(repositoryPath, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    return stdout || preferredBranch;
  }
};

export const ensureLaneWorktree = async ({
  repositoryPath,
  worktreePath,
  branchName,
  baseBranch,
}: {
  repositoryPath: string;
  worktreePath: string;
  branchName: string;
  baseBranch: string;
}): Promise<void> => {
  try {
    const stats = await fs.stat(path.join(worktreePath, ".git"));
    if (stats.isFile() || stats.isDirectory()) {
      return;
    }
  } catch {
    // Continue and create the worktree below.
  }

  await fs.mkdir(path.dirname(worktreePath), { recursive: true });

  const args = (await branchExists(repositoryPath, branchName))
    ? ["worktree", "add", "--force", worktreePath, branchName]
    : ["worktree", "add", "--force", "-b", branchName, worktreePath, baseBranch];

  await runGit(repositoryPath, args);
};

export const detectBranchConflict = async ({
  repositoryPath,
  baseBranch,
  branchName,
}: {
  repositoryPath: string;
  baseBranch: string;
  branchName: string;
}): Promise<boolean> => {
  const mergeBase = await runGit(repositoryPath, ["merge-base", baseBranch, branchName]);
  const mergeTree = await runGit(repositoryPath, [
    "merge-tree",
    mergeBase.stdout,
    baseBranch,
    branchName,
  ]);

  return (
    mergeTree.stdout.includes("<<<<<<<") ||
    mergeTree.stdout.includes("changed in both") ||
    mergeTree.stdout.includes("CONFLICT")
  );
};
