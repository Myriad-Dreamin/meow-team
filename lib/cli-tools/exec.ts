import { execFile, type ExecFileOptions } from "node:child_process";

const DEFAULT_MAX_BUFFER = 1024 * 1024 * 4;

type CommandResult = {
  stdout: string;
  stderr: string;
};

type CommandError = NodeJS.ErrnoException & {
  code?: number | string;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
};

export class CliCommandError extends Error {
  command: string;
  args: string[];
  exitCode: number | string | null;
  stdout: string;
  stderr: string;

  constructor({
    message,
    command,
    args,
    exitCode,
    stdout,
    stderr,
  }: {
    message: string;
    command: string;
    args: string[];
    exitCode: number | string | null;
    stdout: string;
    stderr: string;
  }) {
    super(message);
    this.name = "CliCommandError";
    this.command = command;
    this.args = args;
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

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

const normalizeExitCode = (error: CommandError): number | string | null => {
  return typeof error.code === "number" || typeof error.code === "string" ? error.code : null;
};

export const isCliCommandErrorExitCode = (
  error: unknown,
  exitCode: number | string,
): error is CliCommandError => {
  return error instanceof CliCommandError && error.exitCode === exitCode;
};

export const execCliCommand = async ({
  failureMessage,
  ...options
}: ExecCliCommandOptions): Promise<CommandResult> => {
  try {
    return await execFileAsync(options);
  } catch (error) {
    const commandError = error as CommandError;
    throw new CliCommandError({
      message: buildFailureMessage(commandError, failureMessage),
      command: options.command,
      args: options.args,
      exitCode: normalizeExitCode(commandError),
      stdout: normalizeOutput(commandError.stdout),
      stderr: normalizeOutput(commandError.stderr),
    });
  }
};
