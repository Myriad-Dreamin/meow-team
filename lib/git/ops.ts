import "server-only";

import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import { runGit } from "@/lib/cli-tools/git";

const branchExists = async (repositoryPath: string, branchName: string): Promise<boolean> => {
  try {
    await runGit(repositoryPath, ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`]);
    return true;
  } catch {
    return false;
  }
};

export type GitWorktreeRecord = {
  worktreePath: string;
  branchName: string | null;
};

export const listGitWorktrees = async (repositoryPath: string): Promise<GitWorktreeRecord[]> => {
  const { stdout } = await runGit(repositoryPath, ["worktree", "list", "--porcelain"]);
  const worktrees: GitWorktreeRecord[] = [];
  let current: GitWorktreeRecord | null = null;

  for (const line of stdout.split("\n")) {
    if (!line) {
      if (current) {
        worktrees.push(current);
        current = null;
      }
      continue;
    }

    if (line.startsWith("worktree ")) {
      if (current) {
        worktrees.push(current);
      }

      current = {
        worktreePath: line.slice("worktree ".length),
        branchName: null,
      };
      continue;
    }

    if (line.startsWith("branch ") && current) {
      const refName = line.slice("branch ".length);
      current.branchName = refName.startsWith("refs/heads/")
        ? refName.slice("refs/heads/".length)
        : refName;
    }
  }

  if (current) {
    worktrees.push(current);
  }

  return worktrees;
};

export const listExistingBranches = async ({
  repositoryPath,
  branchNames,
}: {
  repositoryPath: string;
  branchNames: string[];
}): Promise<string[]> => {
  const uniqueBranchNames = Array.from(
    new Set(
      branchNames
        .map((branchName) => branchName.trim())
        .filter((branchName): branchName is string => branchName.length > 0),
    ),
  );
  const existingBranches: string[] = [];

  for (const branchName of uniqueBranchNames) {
    if (await branchExists(repositoryPath, branchName)) {
      existingBranches.push(branchName);
    }
  }

  return existingBranches;
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

export const ensureWorktreeCheckout = async ({
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

const listNamedPaths = (stdout: string): string[] => {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
};

export const listWorktreeChanges = async (worktreePath: string): Promise<string[]> => {
  const [stagedChanges, unstagedChanges, untrackedChanges] = await Promise.all([
    runGit(worktreePath, ["diff", "--cached", "--name-only", "--relative", "--no-renames"]),
    runGit(worktreePath, ["diff", "--name-only", "--relative", "--no-renames"]),
    runGit(worktreePath, ["ls-files", "--others", "--exclude-standard", "--full-name"]),
  ]);

  return Array.from(
    new Set([
      ...listNamedPaths(stagedChanges.stdout),
      ...listNamedPaths(unstagedChanges.stdout),
      ...listNamedPaths(untrackedChanges.stdout),
    ]),
  ).sort((left, right) => {
    if (left === right) {
      return 0;
    }

    return left < right ? -1 : 1;
  });
};

export const commitWorktreeChanges = async ({
  worktreePath,
  message,
  pathspecs,
}: {
  worktreePath: string;
  message: string;
  pathspecs?: string[];
}): Promise<void> => {
  const normalizedPathspecs = pathspecs
    ?.map((pathspec) => pathspec.trim())
    .filter((pathspec): pathspec is string => pathspec.length > 0);

  await runGit(
    worktreePath,
    normalizedPathspecs?.length ? ["add", "-A", "--", ...normalizedPathspecs] : ["add", "-A"],
  );
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

export const commitContainsPath = async ({
  repositoryPath,
  revision,
  relativePath,
}: {
  repositoryPath: string;
  revision: string;
  relativePath: string;
}): Promise<boolean> => {
  try {
    await runGit(repositoryPath, [
      "cat-file",
      "-e",
      `${revision}:${relativePath.split(path.sep).join("/")}`,
    ]);
    return true;
  } catch {
    return false;
  }
};

export const findCommitContainingPathInReflog = async ({
  worktreePath,
  relativePath,
}: {
  worktreePath: string;
  relativePath: string;
}): Promise<string | null> => {
  const { stdout } = await runGit(worktreePath, ["log", "-g", "--format=%H", "HEAD"]);
  const commits = Array.from(
    new Set(
      stdout
        .split("\n")
        .map((value) => value.trim())
        .filter((value): value is string => value.length > 0),
    ),
  );

  for (const commit of commits) {
    if (
      await commitContainsPath({
        repositoryPath: worktreePath,
        revision: commit,
        relativePath,
      })
    ) {
      return commit;
    }
  }

  return null;
};

const pathExists = async (candidatePath: string): Promise<boolean> => {
  try {
    await fs.stat(candidatePath);
    return true;
  } catch {
    return false;
  }
};

const findExistingArchivedOpenSpecChange = async ({
  worktreePath,
  changeName,
}: {
  worktreePath: string;
  changeName: string;
}): Promise<string | null> => {
  const archiveRootPath = path.join(worktreePath, "openspec", "changes", "archive");

  let archiveEntries: Dirent<string>[];
  try {
    archiveEntries = await fs.readdir(archiveRootPath, {
      encoding: "utf8",
      withFileTypes: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }

  const matchingArchivePaths = archiveEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((entryName) => {
      const match = /^(\d{4}-\d{2}-\d{2})-(.+)$/u.exec(entryName);
      return match?.[2] === changeName;
    })
    .sort((left, right) => left.localeCompare(right))
    .map((entryName) => path.join("openspec", "changes", "archive", entryName));

  if (matchingArchivePaths.length > 1) {
    throw new Error(
      `OpenSpec change ${changeName} has multiple archived copies: ${matchingArchivePaths.join(", ")}.`,
    );
  }

  return matchingArchivePaths[0] ?? null;
};

export const inspectOpenSpecChangeArchiveState = async ({
  worktreePath,
  changeName,
}: {
  worktreePath: string;
  changeName: string;
}): Promise<{
  sourcePath: string;
  sourceExists: boolean;
  archivedPath: string | null;
}> => {
  const sourcePath = path.join("openspec", "changes", changeName).split(path.sep).join("/");

  return {
    sourcePath,
    sourceExists: await pathExists(path.join(worktreePath, sourcePath)),
    archivedPath:
      (await findExistingArchivedOpenSpecChange({
        worktreePath,
        changeName,
      })) ?? null,
  };
};

export const archiveOpenSpecChangeInWorktree = async ({
  worktreePath,
  changeName,
  archiveDate = new Date(),
}: {
  worktreePath: string;
  changeName: string;
  archiveDate?: Date;
}): Promise<{
  archivedPath: string;
  createdArchive: boolean;
}> => {
  const datedArchiveName = `${archiveDate.toISOString().slice(0, 10)}-${changeName}`;
  const sourceRelativePath = path.join("openspec", "changes", changeName);
  const archiveRelativePath =
    (await findExistingArchivedOpenSpecChange({
      worktreePath,
      changeName,
    })) ?? path.join("openspec", "changes", "archive", datedArchiveName);
  const sourcePath = path.join(worktreePath, sourceRelativePath);
  const archivePath = path.join(worktreePath, archiveRelativePath);

  const [sourceExists, archiveExists] = await Promise.all([
    pathExists(sourcePath),
    pathExists(archivePath),
  ]);

  if (sourceExists && archiveExists) {
    throw new Error(
      `OpenSpec change ${changeName} cannot be archived because both ${sourceRelativePath} and ${archiveRelativePath} already exist.`,
    );
  }

  if (!sourceExists && archiveExists) {
    return {
      archivedPath: archiveRelativePath.split(path.sep).join("/"),
      createdArchive: false,
    };
  }

  if (!sourceExists) {
    throw new Error(`OpenSpec change ${changeName} was not found at ${sourceRelativePath}.`);
  }

  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await fs.rename(sourcePath, archivePath);

  return {
    archivedPath: archiveRelativePath.split(path.sep).join("/"),
    createdArchive: true,
  };
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

export const tryRebaseWorktreeBranch = async ({
  worktreePath,
  baseBranch,
}: {
  worktreePath: string;
  baseBranch: string;
}): Promise<{
  applied: boolean;
  error: string | null;
}> => {
  try {
    await runGit(worktreePath, ["rebase", baseBranch]);
    return {
      applied: true,
      error: null,
    };
  } catch (error) {
    try {
      await runGit(worktreePath, ["rebase", "--abort"]);
    } catch {
      // Ignore cleanup failures and return the original rebase error below.
    }

    return {
      applied: false,
      error: error instanceof Error ? error.message : "Git rebase failed.",
    };
  }
};
