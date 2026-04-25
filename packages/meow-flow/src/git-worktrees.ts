import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

const DEFAULT_WORKTREE_DIRECTORY_NAME = ".paseo-workspaces";
const DEFAULT_WORKTREE_BASENAME_PATTERN = /^paseo-(\d+)$/;

export type GitWorktree = {
  readonly path: string;
  readonly branch: string | null;
  readonly head: string | null;
  readonly isPrimary: boolean;
};

export type GitWorktreeContext = {
  readonly repositoryRoot: string;
  readonly worktrees: readonly GitWorktree[];
};

export class GitRepositoryRequiredError extends Error {
  constructor(commandName: string) {
    super(`${commandName} must be run inside a git repository.`);
    this.name = "GitRepositoryRequiredError";
  }
}

export class NoLinkedWorktreeAvailableError extends Error {
  constructor() {
    super("No git worktree is available for MeowFlow. Create one with: mfl worktree new");
    this.name = "NoLinkedWorktreeAvailableError";
  }
}

export function resolveGitWorktreeContext(input: {
  readonly cwd: string;
  readonly commandName: string;
}): GitWorktreeContext {
  const repositoryRoot = resolveCanonicalGitRoot(input.cwd, input.commandName);
  const worktrees = listGitWorktrees(repositoryRoot, repositoryRoot);

  return {
    repositoryRoot,
    worktrees,
  };
}

export function selectAvailableLinkedWorktree(context: GitWorktreeContext): GitWorktree {
  const worktree = getLinkedWorktrees(context).at(0);

  if (!worktree) {
    throw new NoLinkedWorktreeAvailableError();
  }

  return worktree;
}

export function getLinkedWorktrees(context: GitWorktreeContext): readonly GitWorktree[] {
  return [...context.worktrees]
    .filter((worktree) => !worktree.isPrimary)
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function createNextPaseoWorktree(input: {
  readonly context: GitWorktreeContext;
  readonly branchName?: string;
}): GitWorktree {
  const nextSlot = findNextPaseoWorktreeSlot(input.context);
  const branchName = normalizeBranchName(input.branchName) ?? createRandomBranchName();
  const worktreePath = path.join(
    input.context.repositoryRoot,
    DEFAULT_WORKTREE_DIRECTORY_NAME,
    `paseo-${nextSlot}`,
  );

  runRequiredGit(
    ["worktree", "add", "-b", branchName, worktreePath, "HEAD"],
    input.context.repositoryRoot,
  );

  const refreshedContext = resolveGitWorktreeContext({
    cwd: input.context.repositoryRoot,
    commandName: "mfl worktree new",
  });
  const created = refreshedContext.worktrees.find((worktree) => worktree.path === worktreePath);

  if (!created) {
    throw new Error(`Created worktree was not reported by git: ${worktreePath}`);
  }

  return created;
}

export function removeLinkedWorktree(input: {
  readonly context: GitWorktreeContext;
  readonly target: string;
}): GitWorktree {
  const target = input.target.trim();

  if (target.length === 0) {
    throw new Error("Worktree target must not be empty.");
  }

  const linkedWorktrees = getLinkedWorktrees(input.context);
  const resolvedTargetPath = path.resolve(input.context.repositoryRoot, target);
  const matchingWorktrees = linkedWorktrees.filter(
    (worktree) =>
      worktree.path === resolvedTargetPath ||
      worktree.path === target ||
      path.basename(worktree.path) === target ||
      worktree.branch === target ||
      path.relative(input.context.repositoryRoot, worktree.path) === target,
  );

  if (matchingWorktrees.length === 0) {
    throw new Error(`Worktree not found: ${target}`);
  }

  if (matchingWorktrees.length > 1) {
    throw new Error(`Worktree target is ambiguous: ${target}`);
  }

  const worktree = matchingWorktrees[0];

  if (!worktree) {
    throw new Error(`Worktree not found: ${target}`);
  }

  runRequiredGit(["worktree", "remove", worktree.path], input.context.repositoryRoot);

  return worktree;
}

export function formatWorktreePath(repositoryRoot: string, worktreePath: string): string {
  const relativePath = path.relative(repositoryRoot, worktreePath);

  if (relativePath.length === 0) {
    return ".";
  }

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return worktreePath;
  }

  return relativePath;
}

function findNextPaseoWorktreeSlot(context: GitWorktreeContext): number {
  const maxSlot = context.worktrees.reduce((max, worktree) => {
    const relativePath = path.relative(context.repositoryRoot, worktree.path);
    const pathSegments = relativePath.split(path.sep);

    if (pathSegments.length !== 2 || pathSegments[0] !== DEFAULT_WORKTREE_DIRECTORY_NAME) {
      return max;
    }

    const match = DEFAULT_WORKTREE_BASENAME_PATTERN.exec(pathSegments[1] ?? "");
    const slot = match ? Number.parseInt(match[1] ?? "0", 10) : 0;

    return Number.isFinite(slot) ? Math.max(max, slot) : max;
  }, 0);

  return maxSlot + 1;
}

function normalizeBranchName(branchName: string | undefined): string | null {
  if (branchName === undefined) {
    return null;
  }

  const normalized = branchName.trim();

  if (normalized.length === 0) {
    throw new Error("Branch name must not be empty.");
  }

  return normalized;
}

function createRandomBranchName(): string {
  return `mfl-${randomUUID().slice(0, 8)}`;
}

function resolveCanonicalGitRoot(cwd: string, commandName: string): string {
  const insideWorkTree = runGit(["rev-parse", "--is-inside-work-tree"], cwd, {
    allowFailure: true,
  });

  if (insideWorkTree.status !== 0 || insideWorkTree.stdout.trim() !== "true") {
    throw new GitRepositoryRequiredError(commandName);
  }

  const commonDir = runRequiredGit(["rev-parse", "--git-common-dir"], cwd).trim();
  const absoluteCommonDir = path.isAbsolute(commonDir) ? commonDir : path.resolve(cwd, commonDir);

  return path.dirname(absoluteCommonDir);
}

function listGitWorktrees(cwd: string, repositoryRoot: string): readonly GitWorktree[] {
  const output = runRequiredGit(["worktree", "list", "--porcelain"], cwd);
  const records = output.split(/\r?\n\r?\n/).filter((record) => record.trim().length > 0);

  return records.map((record) => {
    const lines = record.split(/\r?\n/);
    const worktreePath = readPorcelainField(lines, "worktree");

    if (!worktreePath) {
      throw new Error("git worktree list returned a record without a worktree path.");
    }

    const branchRef = readPorcelainField(lines, "branch");
    const branch = branchRef?.startsWith("refs/heads/")
      ? branchRef.slice("refs/heads/".length)
      : (branchRef ?? null);
    const absolutePath = path.resolve(worktreePath);

    return {
      path: absolutePath,
      branch,
      head: readPorcelainField(lines, "HEAD"),
      isPrimary: absolutePath === repositoryRoot,
    };
  });
}

function readPorcelainField(lines: readonly string[], fieldName: string): string | null {
  const prefix = `${fieldName} `;
  const line = lines.find((entry) => entry.startsWith(prefix));

  return line ? line.slice(prefix.length) : null;
}

function runRequiredGit(args: readonly string[], cwd: string): string {
  const result = runGit(args, cwd, { allowFailure: false });

  return result.stdout;
}

function runGit(
  args: readonly string[],
  cwd: string,
  options: { readonly allowFailure: boolean },
): { readonly status: number | null; readonly stdout: string } {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  if (!options.allowFailure && result.status !== 0) {
    const detail = result.stderr.trim();
    throw new Error(detail.length === 0 ? `git ${args.join(" ")} failed.` : detail);
  }

  return {
    status: result.status,
    stdout: result.stdout,
  };
}
