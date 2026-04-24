import { spawnSync } from "node:child_process";
import path from "node:path";
import { Command } from "commander";
import { loadMeowFlowTeamConfig } from "./team-config.js";

type ThreadListCommandOptions = {
  readonly config?: string;
};

type ThreadWorkspaceStatus = "idle" | "occupied" | "not-created";

type ThreadWorkspaceRow = {
  readonly relativePath: string;
  readonly status: ThreadWorkspaceStatus;
};

export function createThreadCommand(): Command {
  return new Command("thread")
    .description("Inspect Meow Flow thread worktree slots")
    .addCommand(createThreadListCommand());
}

function createThreadListCommand(): Command {
  return new Command("ls")
    .description("List configured Paseo worktree slots for the current git repository")
    .option(
      "-c, --config <path>",
      "load an explicit config path instead of the installed shared config",
    )
    .action((options: ThreadListCommandOptions, command: Command) => {
      try {
        const repositoryRoot = resolveCanonicalGitRoot(process.cwd());
        const loadedConfig = loadMeowFlowTeamConfig({
          cwd: process.cwd(),
          configPath: options.config,
        });
        const maxConcurrentWorkers = loadedConfig.config.dispatch.maxConcurrentWorkers;

        if (maxConcurrentWorkers === null) {
          throw new MissingThreadSlotCountError(loadedConfig.configPath);
        }

        const registeredWorktrees = listRegisteredGitWorktrees(repositoryRoot);
        const rows = createThreadWorkspaceRows({
          repositoryRoot,
          registeredWorktrees,
          maxConcurrentWorkers,
        });

        process.stdout.write(`${formatThreadWorkspaceRows(rows)}\n`);
      } catch (error) {
        command.error(error instanceof Error ? error.message : String(error));
      }
    });
}

class MissingThreadSlotCountError extends Error {
  constructor(configPath: string) {
    super(
      `Meow Flow thread slot count is not configured. Set dispatch.maxConcurrentWorkers in ${configPath} before running meow-flow thread ls.`,
    );
    this.name = "MissingThreadSlotCountError";
  }
}

class GitRepositoryRequiredError extends Error {
  constructor() {
    super("meow-flow thread ls must be run inside a git repository.");
    this.name = "GitRepositoryRequiredError";
  }
}

function resolveCanonicalGitRoot(cwd: string): string {
  const insideWorkTree = runGit(["rev-parse", "--is-inside-work-tree"], cwd, {
    allowFailure: true,
  });

  if (insideWorkTree.status !== 0 || insideWorkTree.stdout.trim() !== "true") {
    throw new GitRepositoryRequiredError();
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

function createThreadWorkspaceRows(input: {
  readonly repositoryRoot: string;
  readonly registeredWorktrees: ReadonlySet<string>;
  readonly maxConcurrentWorkers: number;
}): readonly ThreadWorkspaceRow[] {
  return Array.from({ length: input.maxConcurrentWorkers }, (_, index) => {
    const slotNumber = index + 1;
    const relativePath = `.paseo-worktrees/paseo-${slotNumber}`;
    const absolutePath = path.join(input.repositoryRoot, ".paseo-worktrees", `paseo-${slotNumber}`);

    return {
      relativePath,
      status: input.registeredWorktrees.has(absolutePath) ? "idle" : "not-created",
    };
  });
}

function resolveGitPath(cwd: string, gitPath: string): string {
  return path.isAbsolute(gitPath) ? path.resolve(gitPath) : path.resolve(cwd, gitPath);
}

function formatThreadWorkspaceRows(rows: readonly ThreadWorkspaceRow[]): string {
  return rows
    .map((row) =>
      row.status === "not-created"
        ? `${row.relativePath} not-created (folder is not allocated)`
        : `${row.relativePath} ${row.status}`,
    )
    .join("\n");
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
