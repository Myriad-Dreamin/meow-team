import { Command } from "commander";
import { resolveGitWorktreeContext } from "./git-worktrees.js";
import {
  formatThreadStatus,
  getActiveOccupationForWorktree,
  getThread,
  isThreadArchived,
  readMeowFlowState,
  releaseActiveOccupation,
  replaceThread,
  updateMeowFlowState,
} from "./thread-state.js";

type ThreadStatusOptions = {
  readonly color?: boolean;
};

const THREAD_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function createThreadCommand(): Command {
  return new Command("thread")
    .description("Inspect and update MeowFlow thread metadata")
    .addCommand(createThreadStatusCommand())
    .addCommand(createThreadSetCommand())
    .addCommand(createThreadArchiveCommand());
}

function createThreadStatusCommand(): Command {
  return new Command("status")
    .description("Render persisted MeowFlow thread metadata")
    .argument("<id>", "thread id to inspect")
    .option("--no-color", "disable colored output")
    .action((threadId: string, _options: ThreadStatusOptions, command: Command) => {
      try {
        const context = resolveGitWorktreeContext({
          cwd: process.cwd(),
          commandName: "mfl thread status",
        });
        const state = readMeowFlowState(context.repositoryRoot);
        const thread = getThread(state, threadId);

        if (!thread) {
          throw new Error(`Thread not found: ${threadId}`);
        }

        process.stdout.write(formatThreadStatus(thread));
      } catch (error) {
        command.error(error instanceof Error ? error.message : String(error));
      }
    });
}

function createThreadSetCommand(): Command {
  return new Command("set")
    .description("Set fields on the current MeowFlow thread")
    .addCommand(createThreadSetNameCommand());
}

function createThreadSetNameCommand(): Command {
  return new Command("name")
    .description("Set the readable name for the current MeowFlow thread")
    .argument("<name>", "new readable thread name")
    .action((name: string, _options: unknown, command: Command) => {
      try {
        const trimmedName = name.trim();
        if (trimmedName.length === 0) {
          throw new Error("Thread name must not be empty.");
        }
        if (!THREAD_NAME_PATTERN.test(trimmedName)) {
          throw new Error("Thread name must be kebab-case matching ^[a-z0-9]+(-[a-z0-9]+)*$.");
        }

        const current = resolveCurrentThread("mfl thread set name");
        updateMeowFlowState(current.context.repositoryRoot, (state) => {
          const thread = getThread(state, current.threadId);
          if (!thread) {
            throw new Error(`Thread not found: ${current.threadId}`);
          }

          replaceThread(state, {
            ...thread,
            name: trimmedName,
          });
        });

        process.stdout.write(`name: ${trimmedName}\n`);
      } catch (error) {
        command.error(error instanceof Error ? error.message : String(error));
      }
    });
}

function createThreadArchiveCommand(): Command {
  return new Command("archive")
    .description("Archive the current MeowFlow thread and release this worktree")
    .action((_options: unknown, command: Command) => {
      try {
        const current = resolveCurrentThread("mfl thread archive", { allowArchived: true });
        const now = new Date().toISOString();

        updateMeowFlowState(current.context.repositoryRoot, (state) => {
          const thread = getThread(state, current.threadId);
          if (!thread) {
            throw new Error(`Thread not found: ${current.threadId}`);
          }
          if (thread.archivedAt !== null) {
            throw new Error(`Thread is already archived: ${current.threadId}`);
          }

          replaceThread(state, {
            ...thread,
            archivedAt: now,
          });
          releaseActiveOccupation(state, {
            threadId: current.threadId,
            worktreePath: current.worktreePath,
            now,
          });
        });

        process.stdout.write(`archived: ${current.threadId}\n`);
      } catch (error) {
        command.error(error instanceof Error ? error.message : String(error));
      }
    });
}

export function resolveCurrentThread(
  commandName: string,
  options: { readonly allowArchived?: boolean } = {},
): {
  readonly context: ReturnType<typeof resolveGitWorktreeContext>;
  readonly threadId: string;
  readonly worktreePath: string;
} {
  const context = resolveGitWorktreeContext({
    cwd: process.cwd(),
    commandName,
  });
  const state = readMeowFlowState(context.repositoryRoot);
  const occupation = getActiveOccupationForWorktree(state, context.currentWorktreeRoot);

  if (!occupation) {
    throw new Error("No current MeowFlow thread could be resolved.");
  }

  const thread = getThread(state, occupation.threadId);
  if (!options.allowArchived && thread && isThreadArchived(thread)) {
    throw new Error(`Thread is archived: ${occupation.threadId}`);
  }

  return {
    context,
    threadId: occupation.threadId,
    worktreePath: occupation.worktreePath,
  };
}
