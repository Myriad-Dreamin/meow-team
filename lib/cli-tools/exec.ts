import "server-only";

import { execFile, type ExecFileOptions } from "node:child_process";

const DEFAULT_MAX_BUFFER = 1024 * 1024 * 4;

type CommandResult = {
  stdout: string;
  stderr: string;
};

type CommandError = NodeJS.ErrnoException & {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
};

export type ExecCliCommandOptions = {
  command: string;
  args: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  failureMessage: string;
};

const normalizeOutput = (value: string | Buffer | undefined): string => {
  if (typeof value === "string") {
    return value.trim();
  }

  return value?.toString("utf8").trim() ?? "";
};

const execFileAsync = async ({
  command,
  args,
  cwd,
  env,
}: Omit<ExecCliCommandOptions, "failureMessage">): Promise<CommandResult> => {
  const options: ExecFileOptions = {
    maxBuffer: DEFAULT_MAX_BUFFER,
  };

  if (cwd) {
    options.cwd = cwd;
  }

  if (env) {
    options.env = env;
  }

  return new Promise<CommandResult>((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        const commandError = error as CommandError;
        commandError.stdout = stdout;
        commandError.stderr = stderr;
        reject(commandError);
        return;
      }

      resolve({
        stdout: normalizeOutput(stdout),
        stderr: normalizeOutput(stderr),
      });
    });
  });
};

const buildFailureMessage = (error: unknown, fallbackMessage: string): string => {
  const commandError = error as CommandError;
  const output = [normalizeOutput(commandError.stderr), normalizeOutput(commandError.stdout)]
    .filter(Boolean)
    .join("\n")
    .trim();

  return output || fallbackMessage;
};

export const execCliCommand = async ({
  failureMessage,
  ...options
}: ExecCliCommandOptions): Promise<CommandResult> => {
  try {
    return await execFileAsync(options);
  } catch (error) {
    throw new Error(buildFailureMessage(error, failureMessage));
  }
};
