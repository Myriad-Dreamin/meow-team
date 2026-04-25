import { spawnSync } from "node:child_process";
import path from "node:path";
import { loadMeowFlowTeamConfig, type LoadedMeowFlowTeamConfig } from "./team-config.js";

export type ThreadWorkspaceStatus = "idle" | "occupied" | "not-created";

export type ThreadWorkspaceRow = {
  readonly slotNumber: number;
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly status: ThreadWorkspaceStatus;
  readonly threadId: string | null;
};

export type ThreadWorkspaceContext = {
  readonly repositoryRoot: string;
  readonly loadedConfig: LoadedMeowFlowTeamConfig;
  readonly maxConcurrentWorkers: number;
  readonly registeredWorktrees: ReadonlySet<string>;
};

type ThreadWorkspaceOccupation = {
  readonly repositoryRoot: string;
  readonly slotNumber: number;
  readonly threadId: string;
};

export class MissingThreadSlotCountError extends Error {
  constructor(configPath: string, commandName: string) {
    super(
      `Meow Flow thread slot count is not configured. Set dispatch.maxConcurrentWorkers in ${configPath} before running ${commandName}.`,
    );
    this.name = "MissingThreadSlotCountError";
  }
}

export class GitRepositoryRequiredError extends Error {
  constructor(commandName: string) {
    super(`${commandName} must be run inside a git repository.`);
    this.name = "GitRepositoryRequiredError";
  }
}

export function resolveThreadWorkspaceContext(input: {
  readonly cwd: string;
  readonly configPath?: string;
  readonly commandName: string;
}): ThreadWorkspaceContext {
  const repositoryRoot = resolveCanonicalGitRoot(input.cwd, input.commandName);
  const loadedConfig = loadMeowFlowTeamConfig({
    cwd: input.cwd,
    configPath: input.configPath,
  });
  const maxConcurrentWorkers = loadedConfig.config.dispatch.maxConcurrentWorkers;

  if (maxConcurrentWorkers === null) {
    throw new MissingThreadSlotCountError(loadedConfig.configPath, input.commandName);
  }

  return {
    repositoryRoot,
    loadedConfig,
    maxConcurrentWorkers,
    registeredWorktrees: listRegisteredGitWorktrees(repositoryRoot),
  };
}

export function createThreadWorkspaceRows(input: {
  readonly repositoryRoot: string;
  readonly registeredWorktrees: ReadonlySet<string>;
  readonly maxConcurrentWorkers: number;
  readonly occupations?: readonly ThreadWorkspaceOccupation[];
}): readonly ThreadWorkspaceRow[] {
  const occupationsBySlot = new Map<number, ThreadWorkspaceOccupation>();

  for (const occupation of input.occupations ?? []) {
    if (occupation.repositoryRoot === input.repositoryRoot) {
      occupationsBySlot.set(occupation.slotNumber, occupation);
    }
  }

  return Array.from({ length: input.maxConcurrentWorkers }, (_, index) => {
    const slotNumber = index + 1;
    const workspace = createThreadWorkspaceDescriptor(input.repositoryRoot, slotNumber);

    if (!input.registeredWorktrees.has(workspace.absolutePath)) {
      return {
        ...workspace,
        status: "not-created",
        threadId: null,
      };
    }

    const occupation = occupationsBySlot.get(slotNumber);

    if (occupation) {
      return {
        ...workspace,
        status: "occupied",
        threadId: occupation.threadId,
      };
    }

    return {
      ...workspace,
      status: "idle",
      threadId: null,
    };
  });
}

export function createThreadWorkspaceDescriptor(
  repositoryRoot: string,
  slotNumber: number,
): Pick<ThreadWorkspaceRow, "slotNumber" | "relativePath" | "absolutePath"> {
  const relativePath = `.paseo-worktrees/paseo-${slotNumber}`;

  return {
    slotNumber,
    relativePath,
    absolutePath: path.join(repositoryRoot, ".paseo-worktrees", `paseo-${slotNumber}`),
  };
}

export function formatThreadWorkspaceRows(rows: readonly ThreadWorkspaceRow[]): string {
  return rows
    .map((row) => {
      if (row.status === "not-created") {
        return `${row.relativePath} not-created (folder is not allocated)`;
      }

      return `${row.relativePath} ${row.threadId ?? row.status}`;
    })
    .join("\n");
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

function listRegisteredGitWorktrees(repositoryRoot: string): ReadonlySet<string> {
  const output = runRequiredGit(["worktree", "list", "--porcelain"], repositoryRoot);
  const worktreePaths = output
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => resolveGitPath(repositoryRoot, line.slice("worktree ".length)));

  return new Set(worktreePaths);
}

function resolveGitPath(cwd: string, gitPath: string): string {
  return path.isAbsolute(gitPath) ? path.resolve(gitPath) : path.resolve(cwd, gitPath);
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
