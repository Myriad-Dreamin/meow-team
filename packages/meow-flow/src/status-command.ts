import { Command } from "commander";
import {
  formatWorktreePath,
  GitRepositoryRequiredError,
  getLinkedWorktrees,
  resolveGitWorktreeContext,
} from "./git-worktrees.js";
import {
  deriveLatestStage,
  getActiveOccupationForWorktree,
  getThread,
  readMeowFlowState,
} from "./thread-state.js";

export function createStatusCommand(): Command {
  return new Command("status")
    .description("Show the current MeowFlow thread and worktree context")
    .action((_options: unknown, command: Command) => {
      try {
        const context = resolveGitWorktreeContext({
          cwd: process.cwd(),
          commandName: "mfl status",
        });
        const state = readMeowFlowState(context.repositoryRoot);
        const occupation = getActiveOccupationForWorktree(state, context.currentWorktreeRoot);

        if (occupation) {
          const thread = getThread(state, occupation.threadId);
          const latestAgent = thread?.agents.at(-1) ?? null;
          process.stdout.write(
            [
              "status: occupied",
              `thread-id: ${occupation.threadId}`,
              `thread-name: ${thread?.name ?? occupation.threadId}`,
              `worktree: ${formatWorktreePath(context.repositoryRoot, occupation.worktreePath)}`,
              `stage: ${thread ? deriveLatestStage(thread) : "plan"}`,
              `agent-id: ${latestAgent?.id ?? "unknown"}`,
              "",
            ].join("\n"),
          );
          return;
        }

        const currentLinkedWorktree = getLinkedWorktrees(context).find(
          (worktree) => worktree.path === context.currentWorktreeRoot,
        );

        if (currentLinkedWorktree) {
          process.stdout.write(
            [
              "status: idle",
              `worktree: ${formatWorktreePath(context.repositoryRoot, currentLinkedWorktree.path)}`,
              "No MeowFlow thread is active in this worktree.",
              "",
            ].join("\n"),
          );
          return;
        }

        process.stdout.write(
          [
            "status: repository-root",
            "No MeowFlow worktree selected.",
            "Create one with: mfl worktree new",
            "",
          ].join("\n"),
        );
      } catch (error) {
        if (error instanceof GitRepositoryRequiredError) {
          command.error("mfl status must be run inside a git repository or MeowFlow worktree.");
          return;
        }

        command.error(error instanceof Error ? error.message : String(error));
      }
    });
}
