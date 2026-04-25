import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Command } from "commander";

type RunCommandOptions = {
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
    .description("Launch a labeled Paseo agent for the current working directory")
    .option("--id <id>", "use an explicit MeowFlow thread id instead of generating a UUID")
    .argument("<request-body>", "request body to pass through to paseo run")
    .action((requestBody: string, options: RunCommandOptions, command: Command) => {
      try {
        const threadId = resolveThreadId(options.id);
        const paseoRunResult = invokePaseoRun({
          threadId,
          requestBody,
        });

        if (!paseoRunResult.ok) {
          throw new Error(paseoRunResult.message);
        }

        process.stdout.write(`Thread: ${threadId}\n`);
      } catch (error) {
        command.error(error instanceof Error ? error.message : String(error));
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
  readonly threadId: string;
  readonly requestBody: string;
}): PaseoRunResult {
  const result = spawnSync(
    "paseo",
    ["run", "--label", `x-meow-flow-id=${input.threadId}`, input.requestBody],
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
