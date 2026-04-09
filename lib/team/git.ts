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

export const buildCanonicalBranchName = ({
  branchPrefix,
  assignmentNumber,
}: {
  branchPrefix: string;
  assignmentNumber: number;
}): string => {
  const sanitizedPrefix = sanitizeBranchSegment(branchPrefix);
  return `requests/${sanitizedPrefix}/a${assignmentNumber}`;
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
  const canonicalBranchName = buildCanonicalBranchName({
    branchPrefix,
    assignmentNumber,
  });

  return `${canonicalBranchName}/proposal-${laneIndex}`;
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

export const buildLaneWorktreePath = ({
  worktreeRoot,
  laneIndex,
}: {
  worktreeRoot: string;
  laneIndex: number;
}): string => {
  return path.join(worktreeRoot, `meow-${laneIndex}`);
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

const ensureWorktreeRootIgnored = async ({
  repositoryPath,
  worktreeRoot,
}: {
  repositoryPath: string;
  worktreeRoot: string;
}): Promise<void> => {
  const relativePath = path.relative(repositoryPath, worktreeRoot);
  if (!relativePath || relativePath.startsWith("..")) {
    return;
  }

  const normalizedEntry = `${relativePath.split(path.sep).join("/")}/`;
  const gitPath = await runGit(repositoryPath, ["rev-parse", "--git-path", "info/exclude"]);
  const excludePath = path.isAbsolute(gitPath.stdout)
    ? gitPath.stdout
    : path.join(repositoryPath, gitPath.stdout);

  let current = "";
  try {
    current = await fs.readFile(excludePath, "utf8");
  } catch {
    await fs.mkdir(path.dirname(excludePath), { recursive: true });
  }

  const existingEntries = current
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (existingEntries.includes(normalizedEntry)) {
    return;
  }

  const nextContent = `${current.trimEnd()}\n${normalizedEntry}\n`;
  await fs.writeFile(excludePath, nextContent.replace(/^\n/, ""), "utf8");
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
  const resolvedWorktreeRoot = worktreeRoot ?? path.dirname(worktreePath);

  await ensureWorktreeRootIgnored({
    repositoryPath,
    worktreeRoot: resolvedWorktreeRoot,
  });
  await fs.mkdir(path.dirname(worktreePath), { recursive: true });

  try {
    const stats = await fs.stat(path.join(worktreePath, ".git"));
    if (stats.isFile() || stats.isDirectory()) {
      // Managed worktrees are reusable slots, so make them safe to retarget.
      await runGit(worktreePath, ["reset", "--hard"]);
      await runGit(worktreePath, ["clean", "-fd"]);
      if (await branchExists(repositoryPath, branchName)) {
        await runGit(worktreePath, ["checkout", branchName]);
      } else {
        await runGit(worktreePath, ["checkout", "-B", branchName, startPoint]);
      }
      return;
    }
  } catch {
    // Continue and create the worktree below.
  }

  try {
    const entries = await fs.readdir(worktreePath);
    if (entries.length > 0) {
      await fs.rm(worktreePath, { recursive: true, force: true });
    }
  } catch {
    // Directory does not exist yet.
  }

  const args = (await branchExists(repositoryPath, branchName))
    ? ["worktree", "add", "--force", worktreePath, branchName]
    : ["worktree", "add", "--force", "-b", branchName, worktreePath, startPoint];

  await runGit(repositoryPath, args);
};

export const ensureBranchRef = async ({
  repositoryPath,
  branchName,
  startPoint,
  forceUpdate = false,
}: {
  repositoryPath: string;
  branchName: string;
  startPoint: string;
  forceUpdate?: boolean;
}): Promise<void> => {
  if (!forceUpdate && (await branchExists(repositoryPath, branchName))) {
    return;
  }

  await runGit(repositoryPath, ["branch", ...(forceUpdate ? ["-f"] : []), branchName, startPoint]);
};

export const hasWorktreeChanges = async (worktreePath: string): Promise<boolean> => {
  const { stdout } = await runGit(worktreePath, ["status", "--short"]);
  return stdout.length > 0;
};

export const commitWorktreeChanges = async ({
  worktreePath,
  message,
}: {
  worktreePath: string;
  message: string;
}): Promise<void> => {
  await runGit(worktreePath, ["add", "-A"]);
  await runGit(worktreePath, ["commit", "-m", message]);
};

export const getBranchHead = async ({
  repositoryPath,
  branchName,
}: {
  repositoryPath: string;
  branchName: string;
}): Promise<string> => {
  const { stdout } = await runGit(repositoryPath, ["rev-parse", branchName]);
  return stdout;
};

export const removeWorktreeDirectory = async (worktreePath: string): Promise<void> => {
  try {
    await fs.rm(worktreePath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors for managed scratch directories.
  }
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
