import "server-only";

import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import type { TeamPushedCommitRecord } from "@/lib/team/types";

const execFileAsync = promisify(execFile);
const DEFAULT_PUSH_REMOTE_NAME = "origin";

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

const runGh = async (
  repositoryPath: string,
  args: string[],
): Promise<{
  stdout: string;
  stderr: string;
}> => {
  try {
    const result = await execFileAsync("gh", args, {
      cwd: repositoryPath,
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
    throw new Error(
      output || `GitHub CLI command failed in ${repositoryPath}: gh ${args.join(" ")}`,
    );
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

type GitWorktreeRecord = {
  worktreePath: string;
  branchName: string | null;
};

const listGitWorktrees = async (repositoryPath: string): Promise<GitWorktreeRecord[]> => {
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

const isPathInsideRoot = (candidatePath: string, rootPath: string): boolean => {
  const relativePath = path.relative(rootPath, candidatePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
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

const encodeWorktreePathSegment = (value: string): string => {
  // Hex keeps the raw identity reversible while remaining safe on case-insensitive filesystems.
  return Buffer.from(value, "utf8").toString("hex") || "assignment";
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

export const buildLaneWorktreePath = ({
  worktreeRoot,
  laneIndex,
}: {
  worktreeRoot: string;
  laneIndex: number;
}): string => {
  return path.join(worktreeRoot, `meow-${laneIndex}`);
};

export const buildPlannerWorktreePath = ({
  worktreeRoot,
  threadId,
  assignmentNumber,
}: {
  worktreeRoot: string;
  threadId: string;
  assignmentNumber: number;
}): string => {
  const encodedThreadId = encodeWorktreePathSegment(threadId);
  return path.join(worktreeRoot, `planner-${encodedThreadId}-a${assignmentNumber}`);
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

const trimGitSuffix = (value: string): string => {
  return value.replace(/\.git$/iu, "");
};

export const normalizeGitHubRepositoryUrl = (remoteUrl: string): string | null => {
  const trimmedRemoteUrl = remoteUrl.trim();
  if (!trimmedRemoteUrl) {
    return null;
  }

  const sshRemoteMatch = /^git@([^:]+):(.+)$/u.exec(trimmedRemoteUrl);
  if (sshRemoteMatch) {
    const host = sshRemoteMatch[1];
    const repositoryPath = trimGitSuffix(sshRemoteMatch[2] ?? "")
      .replace(/^\/+/u, "")
      .replace(/\/+$/u, "");
    const pathSegments = repositoryPath.split("/").filter(Boolean);
    if (pathSegments.length !== 2) {
      return null;
    }

    return `https://${host}/${pathSegments.join("/")}`;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedRemoteUrl);
  } catch {
    return null;
  }

  if (
    parsedUrl.protocol !== "https:" &&
    parsedUrl.protocol !== "http:" &&
    parsedUrl.protocol !== "ssh:"
  ) {
    return null;
  }

  const repositoryPath = trimGitSuffix(parsedUrl.pathname)
    .replace(/^\/+/u, "")
    .replace(/\/+$/u, "");
  const pathSegments = repositoryPath.split("/").filter(Boolean);
  if (pathSegments.length !== 2) {
    return null;
  }

  return `https://${parsedUrl.host}/${pathSegments.join("/")}`;
};

export const resolveGitHubPushRemote = async ({
  repositoryPath,
  remoteName = DEFAULT_PUSH_REMOTE_NAME,
}: {
  repositoryPath: string;
  remoteName?: string;
}): Promise<{
  remoteName: string;
  fetchUrl: string;
  pushUrl: string;
  repositoryUrl: string;
}> => {
  const { stdout: fetchUrl } = await runGit(repositoryPath, ["remote", "get-url", remoteName]);
  const { stdout: pushUrl } = await runGit(repositoryPath, [
    "remote",
    "get-url",
    "--push",
    remoteName,
  ]);
  const repositoryUrl =
    normalizeGitHubRepositoryUrl(pushUrl) ?? normalizeGitHubRepositoryUrl(fetchUrl);

  if (!repositoryUrl) {
    throw new Error(
      `Git remote ${remoteName} does not expose a GitHub repository URL for commit publishing.`,
    );
  }

  return {
    remoteName,
    fetchUrl,
    pushUrl,
    repositoryUrl,
  };
};

const encodeGitHubRef = (value: string): string => {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
};

export const pushLaneBranch = async ({
  repositoryPath,
  branchName,
  commitHash,
  remoteName = DEFAULT_PUSH_REMOTE_NAME,
  pushedAt = new Date().toISOString(),
}: {
  repositoryPath: string;
  branchName: string;
  commitHash: string;
  remoteName?: string;
  pushedAt?: string;
}): Promise<TeamPushedCommitRecord> => {
  const remote = await resolveGitHubPushRemote({
    repositoryPath,
    remoteName,
  });

  await runGit(repositoryPath, [
    "push",
    "--force-with-lease",
    "--set-upstream",
    remote.remoteName,
    `${branchName}:${branchName}`,
  ]);

  return {
    remoteName: remote.remoteName,
    repositoryUrl: remote.repositoryUrl,
    branchUrl: `${remote.repositoryUrl}/tree/${encodeGitHubRef(branchName)}`,
    commitUrl: `${remote.repositoryUrl}/commit/${commitHash}`,
    commitHash,
    pushedAt,
  };
};

const pathExists = async (candidatePath: string): Promise<boolean> => {
  try {
    await fs.stat(candidatePath);
    return true;
  } catch {
    return false;
  }
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
  const archiveRelativePath = path.join("openspec", "changes", "archive", datedArchiveName);
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

const normalizeGitHubRepositorySlug = (repositoryUrl: string): string | null => {
  const normalizedUrl = normalizeGitHubRepositoryUrl(repositoryUrl);
  if (!normalizedUrl) {
    return null;
  }

  try {
    return new URL(normalizedUrl).pathname.replace(/^\/+/u, "");
  } catch {
    return null;
  }
};

const getGitHubRepositoryOwner = (repositorySlug: string): string | null => {
  const [owner] = repositorySlug.split("/", 1);
  return owner?.trim() ? owner : null;
};

type GitHubPullRequestView = {
  number: number;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
};

const listGitHubPullRequests = async ({
  repositoryPath,
  baseRepositorySlug,
  headSelector,
  baseBranch,
}: {
  repositoryPath: string;
  baseRepositorySlug: string;
  headSelector: string;
  baseBranch: string;
}): Promise<GitHubPullRequestView[]> => {
  const { stdout } = await runGh(repositoryPath, [
    "pr",
    "list",
    "--repo",
    baseRepositorySlug,
    "--base",
    baseBranch,
    "--head",
    headSelector,
    "--state",
    "all",
    "--json",
    "number,url,state",
  ]);

  const parsed = JSON.parse(stdout || "[]") as GitHubPullRequestView[];
  return parsed;
};

export const createOrUpdateGitHubPullRequest = async ({
  repositoryPath,
  branchName,
  baseBranch,
  title,
  body,
  remoteName = DEFAULT_PUSH_REMOTE_NAME,
}: {
  repositoryPath: string;
  branchName: string;
  baseBranch: string;
  title: string;
  body: string;
  remoteName?: string;
}): Promise<{
  url: string;
}> => {
  const remote = await resolveGitHubPushRemote({
    repositoryPath,
    remoteName,
  });
  const baseRepositorySlug =
    normalizeGitHubRepositorySlug(remote.fetchUrl) ??
    normalizeGitHubRepositorySlug(remote.pushUrl) ??
    normalizeGitHubRepositorySlug(remote.repositoryUrl);
  const headRepositorySlug =
    normalizeGitHubRepositorySlug(remote.pushUrl) ??
    normalizeGitHubRepositorySlug(remote.fetchUrl) ??
    normalizeGitHubRepositorySlug(remote.repositoryUrl);

  if (!baseRepositorySlug || !headRepositorySlug) {
    throw new Error(
      "Git remote does not expose enough GitHub repository metadata to create a pull request.",
    );
  }

  const headOwner = getGitHubRepositoryOwner(headRepositorySlug);
  if (!headOwner) {
    throw new Error(`GitHub repository slug ${headRepositorySlug} does not include an owner.`);
  }

  const headSelector =
    baseRepositorySlug === headRepositorySlug ? branchName : `${headOwner}:${branchName}`;
  const existingPullRequest = (
    await listGitHubPullRequests({
      repositoryPath,
      baseRepositorySlug,
      headSelector,
      baseBranch,
    })
  )[0];

  if (existingPullRequest) {
    if (existingPullRequest.state === "MERGED") {
      throw new Error(
        `GitHub pull request ${existingPullRequest.url} is already merged and cannot be refreshed.`,
      );
    }

    if (existingPullRequest.state === "CLOSED") {
      await runGh(repositoryPath, [
        "pr",
        "reopen",
        existingPullRequest.number.toString(),
        "--repo",
        baseRepositorySlug,
      ]);
    }

    await runGh(repositoryPath, [
      "pr",
      "edit",
      existingPullRequest.number.toString(),
      "--repo",
      baseRepositorySlug,
      "--title",
      title,
      "--body",
      body,
      "--base",
      baseBranch,
    ]);

    const refreshedPullRequest = (
      await listGitHubPullRequests({
        repositoryPath,
        baseRepositorySlug,
        headSelector,
        baseBranch,
      })
    )[0];

    if (!refreshedPullRequest) {
      throw new Error(
        `GitHub pull request refresh completed, but the pull request for ${branchName} could not be resolved afterwards.`,
      );
    }

    return {
      url: refreshedPullRequest.url,
    };
  }

  const { stdout } = await runGh(repositoryPath, [
    "pr",
    "create",
    "--repo",
    baseRepositorySlug,
    "--base",
    baseBranch,
    "--head",
    headSelector,
    "--title",
    title,
    "--body",
    body,
  ]);

  const createdPullRequest = (
    await listGitHubPullRequests({
      repositoryPath,
      baseRepositorySlug,
      headSelector,
      baseBranch,
    })
  )[0];

  if (createdPullRequest) {
    return {
      url: createdPullRequest.url,
    };
  }

  const fallbackUrl = stdout
    .split(/\s+/u)
    .map((value) => value.trim())
    .find((value) => /^https?:\/\//u.test(value));
  if (!fallbackUrl) {
    throw new Error(
      `GitHub pull request creation completed, but the pull request for ${branchName} could not be resolved afterwards.`,
    );
  }

  return {
    url: fallbackUrl,
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
