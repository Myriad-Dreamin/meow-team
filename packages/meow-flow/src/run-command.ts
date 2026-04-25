import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { allocateThreadWorkspace } from "./thread-allocation.js";
import { openThreadOccupationStore } from "./thread-occupation-store.js";
import { resolveThreadWorkspaceContext } from "./thread-workspaces.js";

type RunCommandOptions = {
  readonly config?: string;
  readonly id?: string;
};

type PaseoRunResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export function createRunCommand(): Command {
  return new Command("run")
    .description("Allocate an idle Meow Flow thread workspace and launch a labeled Paseo agent")
    .option(
      "-c, --config <path>",
      "load an explicit config path instead of the installed shared config",
    )
    .option("--id <id>", "use an explicit Meow Flow thread id instead of generating a UUID")
    .argument("<request-body>", "request body to pass through to paseo run")
    .action((requestBody: string, options: RunCommandOptions, command: Command) => {
      const store = openThreadOccupationStore();

      try {
        const threadId = resolveThreadId(options.id);
        const context = resolveThreadWorkspaceContext({
          cwd: process.cwd(),
          configPath: options.config,
          commandName: "meow-flow run",
        });
        const allocation = allocateThreadWorkspace({
          store,
          repositoryRoot: context.repositoryRoot,
          registeredWorktrees: context.registeredWorktrees,
          maxConcurrentWorkers: context.maxConcurrentWorkers,
          threadId,
          requestBody,
        });
        const paseoRunResult = invokePaseoRun({
          workspacePath: allocation.workspaceAbsolutePath,
          threadId,
          requestBody,
        });

        if (!paseoRunResult.ok) {
          store.releaseThreadOccupation(threadId);
          throw new Error(paseoRunResult.message);
        }

        process.stdout.write(
          [`Thread: ${threadId}`, `Workspace: ${allocation.workspaceRelativePath}`].join("\n"),
        );
        process.stdout.write("\n");
      } catch (error) {
        command.error(error instanceof Error ? error.message : String(error));
      } finally {
        store.close();
      }
    });
}

function resolveThreadId(explicitThreadId: string | undefined): string {
  if (explicitThreadId === undefined) {
    return randomUUID();
  }

  const trimmedThreadId = explicitThreadId.trim();

  if (trimmedThreadId.length === 0) {
    throw new Error("Thread id must not be empty.");
  }

  return trimmedThreadId;
}

function invokePaseoRun(input: {
  readonly workspacePath: string;
  readonly threadId: string;
  readonly requestBody: string;
}): PaseoRunResult {
  const result = spawnSync(
    "paseo",
    [
      "run",
      "--cwd",
      input.workspacePath,
      "--label",
      `x-meow-flow-id=${input.threadId}`,
      input.requestBody,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    return {
      ok: false,
      message: `paseo run failed to start: ${result.error.message}`,
    };
  }

  if (result.status !== 0) {
    const detail = result.stderr.trim();

    return {
      ok: false,
      message:
        detail.length === 0
          ? `paseo run failed with exit code ${result.status}.`
          : `paseo run failed with exit code ${result.status}: ${detail}`,
    };
  }

  return { ok: true };
}
