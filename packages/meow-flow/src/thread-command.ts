import { Command } from "commander";
import { openThreadOccupationStore } from "./thread-occupation-store.js";
import {
  createThreadWorkspaceRows,
  formatThreadWorkspaceRows,
  resolveThreadWorkspaceContext,
} from "./thread-workspaces.js";

type ThreadListCommandOptions = {
  readonly config?: string;
};

export function createThreadCommand(): Command {
  return new Command("thread")
    .description("Inspect Meow Flow thread worktree slots")
    .addCommand(createThreadListCommand());
}

export function createThreadListCommand(input: { readonly commandName?: string } = {}): Command {
  const commandName = input.commandName ?? "mfl thread ls";

  return new Command("ls")
    .description("List configured Paseo worktree slots for the current git repository")
    .option(
      "-c, --config <path>",
      "load an explicit config path instead of the installed shared config",
    )
    .action((options: ThreadListCommandOptions, command: Command) => {
      const store = openThreadOccupationStore();

      try {
        const context = resolveThreadWorkspaceContext({
          cwd: process.cwd(),
          configPath: options.config,
          commandName,
        });
        const occupations = store.readOccupationsByRepository(context.repositoryRoot);
        const rows = createThreadWorkspaceRows({
          repositoryRoot: context.repositoryRoot,
          registeredWorktrees: context.registeredWorktrees,
          maxConcurrentWorkers: context.maxConcurrentWorkers,
          occupations,
        });

        process.stdout.write(`${formatThreadWorkspaceRows(rows)}\n`);
      } catch (error) {
        command.error(error instanceof Error ? error.message : String(error));
      } finally {
        store.close();
      }
    });
}
