import path from "node:path";
import { isCliCommandErrorExitCode } from "../cli-tools/exec.ts";
import { runGit } from "../cli-tools/git.ts";
import { isGitPlatformId, type GitPlatformId } from "../platform/types.ts";

export const repositoryConfigGitKeys = {
  platform: "meow-team.platform",
} as const;

export type RepositoryConfigKey = keyof typeof repositoryConfigGitKeys;

type RepositoryConfigValueMap = {
  platform: GitPlatformId;
};

export class RepositoryNotFoundError extends Error {
  cwd: string;

  constructor(cwd: string) {
    super(`Repository not found: ${cwd} is not inside a git repository.`);
    this.name = "RepositoryNotFoundError";
    this.cwd = cwd;
  }
}

export class InvalidRepositoryConfigError extends Error {
  repositoryPath: string;
  gitKey: string;
  value: string;

  constructor({
    repositoryPath,
    gitKey,
    value,
  }: {
    repositoryPath: string;
    gitKey: string;
    value: string;
  }) {
    super(`Repository config ${gitKey} in ${repositoryPath} has unsupported value "${value}".`);
    this.name = "InvalidRepositoryConfigError";
    this.repositoryPath = repositoryPath;
    this.gitKey = gitKey;
    this.value = value;
  }
}

const parseRepositoryPlatformId = (
  value: string,
  repositoryPath: string,
): RepositoryConfigValueMap["platform"] => {
  const normalizedValue = value.trim();
  if (isGitPlatformId(normalizedValue)) {
    return normalizedValue;
  }

  throw new InvalidRepositoryConfigError({
    repositoryPath,
    gitKey: repositoryConfigGitKeys.platform,
    value: normalizedValue,
  });
};

const repositoryConfigParsers: {
  [Key in RepositoryConfigKey]: (
    value: string,
    repositoryPath: string,
  ) => RepositoryConfigValueMap[Key];
} = {
  platform: parseRepositoryPlatformId,
};

const isMissingGitConfigValueError = (error: unknown): boolean => {
  return (
    isCliCommandErrorExitCode(error, 1) && error.stdout.length === 0 && error.stderr.length === 0
  );
};

export const resolveGitRepositoryRoot = async (cwd = process.cwd()): Promise<string> => {
  const resolvedCwd = path.resolve(cwd);

  try {
    const { stdout } = await runGit(resolvedCwd, ["rev-parse", "--show-toplevel"]);
    return stdout;
  } catch {
    throw new RepositoryNotFoundError(resolvedCwd);
  }
};

export const readRepositoryConfigValue = async <Key extends RepositoryConfigKey>(
  repositoryPath: string,
  key: Key,
): Promise<RepositoryConfigValueMap[Key] | null> => {
  try {
    const { stdout } = await runGit(repositoryPath, [
      "config",
      "--local",
      "--get",
      repositoryConfigGitKeys[key],
    ]);

    return repositoryConfigParsers[key](stdout, repositoryPath);
  } catch (error) {
    if (isMissingGitConfigValueError(error)) {
      return null;
    }

    throw error;
  }
};

export const writeRepositoryConfigValue = async <Key extends RepositoryConfigKey>(
  repositoryPath: string,
  key: Key,
  value: RepositoryConfigValueMap[Key],
): Promise<RepositoryConfigValueMap[Key]> => {
  const normalizedValue = repositoryConfigParsers[key](value, repositoryPath);

  await runGit(repositoryPath, [
    "config",
    "--local",
    repositoryConfigGitKeys[key],
    normalizedValue,
  ]);

  return normalizedValue;
};

export const readRepositoryPlatformId = async (
  repositoryPath: string,
): Promise<GitPlatformId | null> => {
  return readRepositoryConfigValue(repositoryPath, "platform");
};

export const writeRepositoryPlatformId = async (
  repositoryPath: string,
  platformId: GitPlatformId,
): Promise<GitPlatformId> => {
  return writeRepositoryConfigValue(repositoryPath, "platform", platformId);
};
