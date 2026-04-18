import { execFile, type ExecFileOptions } from "node:child_process";
import { gitPlatformIds, isGitPlatformId, type GitPlatformId } from "../platform/types.ts";

const DEFAULT_MAX_BUFFER = 1024 * 1024 * 4;

export const GIT_REPOSITORY_REQUIRED_ERROR =
  "This command requires a Git repository or worktree. Run it from inside the target repository.";
export const REPOSITORY_PLATFORM_CONFIG_KEY = "meow-team.platform";

type GitCommandResult = {
  stdout: string;
  stderr: string;
};

type GitCommandError = NodeJS.ErrnoException & {
  code?: number | string;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
};

export type RepositoryConfigValue = {
  repositoryPath: string;
  value: string | null;
};

export type RepositoryHarnessConfig = {
  repositoryPath: string;
  platform: string | null;
};

const normalizeOutput = (value: string | Buffer | undefined): string => {
  if (typeof value === "string") {
    return value.trim();
  }

  return value?.toString("utf8").trim() ?? "";
};

const execGit = async (cwd: string, args: string[]): Promise<GitCommandResult> => {
  const options: ExecFileOptions = {
    cwd,
    maxBuffer: DEFAULT_MAX_BUFFER,
  };

  return new Promise<GitCommandResult>((resolve, reject) => {
    execFile("git", args, options, (error, stdout, stderr) => {
      if (error) {
        const commandError = error as GitCommandError;
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

const normalizeConfigValue = (value: string): string | null => {
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
};

const isCommandExitCode = (error: unknown, code: number): boolean => {
  const commandError = error as GitCommandError;
  return Number(commandError.code) === code;
};

const buildConfigFailureMessage = ({
  action,
  key,
  repositoryPath,
  error,
}: {
  action: "read" | "write";
  key: string;
  repositoryPath: string;
  error: unknown;
}): string => {
  const commandError = error as GitCommandError;
  const output = [normalizeOutput(commandError.stderr), normalizeOutput(commandError.stdout)]
    .filter(Boolean)
    .join("\n")
    .trim();

  return (
    output || `Unable to ${action} the repository-local git config key ${key} in ${repositoryPath}.`
  );
};

export const resolveGitRepositoryRoot = async (cwd = process.cwd()): Promise<string> => {
  try {
    const { stdout } = await execGit(cwd, ["rev-parse", "--show-toplevel"]);
    return stdout;
  } catch {
    throw new Error(GIT_REPOSITORY_REQUIRED_ERROR);
  }
};

export const readRepositoryConfigValue = async ({
  cwd = process.cwd(),
  key,
}: {
  cwd?: string;
  key: string;
}): Promise<RepositoryConfigValue> => {
  const repositoryPath = await resolveGitRepositoryRoot(cwd);

  try {
    const { stdout } = await execGit(repositoryPath, ["config", "--local", "--get", key]);
    return {
      repositoryPath,
      value: normalizeConfigValue(stdout),
    };
  } catch (error) {
    if (isCommandExitCode(error, 1) && !normalizeOutput((error as GitCommandError).stderr)) {
      return {
        repositoryPath,
        value: null,
      };
    }

    throw new Error(
      buildConfigFailureMessage({
        action: "read",
        key,
        repositoryPath,
        error,
      }),
    );
  }
};

export const writeRepositoryConfigValue = async ({
  cwd = process.cwd(),
  key,
  value,
}: {
  cwd?: string;
  key: string;
  value: string;
}): Promise<RepositoryConfigValue> => {
  const repositoryPath = await resolveGitRepositoryRoot(cwd);

  try {
    await execGit(repositoryPath, ["config", "--local", key, value]);
  } catch (error) {
    throw new Error(
      buildConfigFailureMessage({
        action: "write",
        key,
        repositoryPath,
        error,
      }),
    );
  }

  return {
    repositoryPath,
    value,
  };
};

export const readRepositoryHarnessConfig = async (
  cwd = process.cwd(),
): Promise<RepositoryHarnessConfig> => {
  const { repositoryPath, value } = await readRepositoryConfigValue({
    cwd,
    key: REPOSITORY_PLATFORM_CONFIG_KEY,
  });

  return {
    repositoryPath,
    platform: value,
  };
};

export const writeRepositoryPlatformConfig = async ({
  cwd = process.cwd(),
  platform,
}: {
  cwd?: string;
  platform: string;
}): Promise<{
  repositoryPath: string;
  platform: GitPlatformId;
}> => {
  if (!isGitPlatformId(platform)) {
    throw new Error(
      `Unsupported platform "${platform}". Use one of: ${gitPlatformIds.join(", ")}.`,
    );
  }

  const { repositoryPath } = await writeRepositoryConfigValue({
    cwd,
    key: REPOSITORY_PLATFORM_CONFIG_KEY,
    value: platform,
  });

  return {
    repositoryPath,
    platform,
  };
};
