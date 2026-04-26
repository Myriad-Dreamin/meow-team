import { Command } from "commander";
import {
  createNextPaseoWorktree,
  formatWorktreePath,
  getLinkedWorktrees,
  removeLinkedWorktree,
  resolveGitWorktreeContext,
  type GitWorktree,
} from "./git-worktrees.js";

type WorktreeNewOptions = {
  readonly branch?: string;
};

export function createWorktreeCommand(name = "worktree"): Command {
  return new Command(name)
    .description(
      name === "workspace" ? "Manage MeowFlow git workspaces" : "Manage MeowFlow git worktrees",
    )
    .addCommand(createWorktreeNewCommand())
    .addCommand(createWorktreeListCommand("ls"))
    .addCommand(createWorktreeListCommand("list"))
    .addCommand(createWorktreeRemoveCommand("rm"))
    .addCommand(createWorktreeRemoveCommand("remove"));
}

function createWorktreeNewCommand(): Command {
  return new Command("new")
    .description("Create a new git worktree for MeowFlow")
    .option("--branch <name>", "use a specific branch name instead of a random one")
    .action((options: WorktreeNewOptions, command: Command) => {
      try {
        const context = resolveGitWorktreeContext({
          cwd: process.cwd(),
          commandName: "mfl worktree new",
        });
        const worktree = createNextPaseoWorktree({
          context,
          branchName: options.branch,
        });

        process.stdout.write(
          `${formatWorktree(worktree, context.repositoryRoot, { includeStatus: false })}\n`,
        );
      } catch (error) {
        command.error(error instanceof Error ? error.message : String(error));
      }
    });
}

function createWorktreeListCommand(commandName: "ls" | "list"): Command {
  return new Command(commandName)
    .description("List git worktrees available to MeowFlow")
    .action((_options: unknown, command: Command) => {
      try {
        const context = resolveGitWorktreeContext({
          cwd: process.cwd(),
          commandName: `mfl worktree ${commandName}`,
        });
        const worktrees = getLinkedWorktrees(context);

        if (worktrees.length === 0) {
          process.stdout.write(
            "No linked git worktrees found. Create one with: mfl worktree new\n",
          );
          return;
        }

        process.stdout.write(
          `${worktrees
            .map((worktree) =>
              formatWorktree(worktree, context.repositoryRoot, { includeStatus: false }),
            )
            .join("\n")}\n`,
        );
      } catch (error) {
        command.error(error instanceof Error ? error.message : String(error));
      }
    });
}

function createWorktreeRemoveCommand(commandName: "rm" | "remove"): Command {
  return new Command(commandName)
    .description("Remove a linked git worktree")
    .argument("<target>", "worktree path, basename, or branch name")
    .action((target: string, _options: unknown, command: Command) => {
      try {
        const context = resolveGitWorktreeContext({
          cwd: process.cwd(),
          commandName: `mfl worktree ${commandName}`,
        });
        const removedWorktree = removeLinkedWorktree({
          context,
          target,
        });

        process.stdout.write(
          `${formatWorktree(removedWorktree, context.repositoryRoot, { includeStatus: true })}\n`,
        );
      } catch (error) {
        command.error(error instanceof Error ? error.message : String(error));
      }
    });
}

function formatWorktree(
  worktree: GitWorktree,
  repositoryRoot: string,
  options: { readonly includeStatus: boolean },
): string {
  const fields = [
    formatWorktreePath(repositoryRoot, worktree.path),
    worktree.branch ?? "detached",
    ...(options.includeStatus ? ["removed"] : []),
  ];

  return fields.join(" ");
}
