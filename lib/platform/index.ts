import "server-only";

import { readRepositoryHarnessConfig } from "@/lib/config/repository";
import { githubPlatformAdapter } from "@/lib/platform/gh";
import type {
  GitPlatformId,
  GitPlatformAdapter,
  PublishGitPlatformBranchArgs,
  ResolveGitPlatformPushRemoteArgs,
  SynchronizeGitPlatformPullRequestArgs,
} from "@/lib/platform/types";
import { DEFAULT_GIT_PLATFORM_ID } from "@/lib/platform/types";

export * from "@/lib/platform/types";

const gitPlatformAdapters: Partial<Record<GitPlatformId, GitPlatformAdapter>> = {
  github: githubPlatformAdapter,
};

export class UnsupportedGitPlatformError extends Error {
  platformId: string;
  repositoryPath: string;

  constructor({ platformId, repositoryPath }: { platformId: string; repositoryPath: string }) {
    super(
      platformId === "ugit"
        ? `Repository ${repositoryPath} is configured to use the "${platformId}" platform, but that adapter is not supported yet.`
        : `Repository ${repositoryPath} is configured to use the unsupported "${platformId}" platform. Set meow-team.platform to github or ugit.`,
    );
    this.name = "UnsupportedGitPlatformError";
    this.platformId = platformId;
    this.repositoryPath = repositoryPath;
  }
}

export const resolveConfiguredGitPlatformId = async (repositoryPath: string): Promise<string> => {
  const { platform } = await readRepositoryHarnessConfig(repositoryPath);
  return platform ?? DEFAULT_GIT_PLATFORM_ID;
};

export const resolveGitPlatform = async (repositoryPath: string): Promise<GitPlatformAdapter> => {
  const platformId = await resolveConfiguredGitPlatformId(repositoryPath);
  const gitPlatform = gitPlatformAdapters[platformId as GitPlatformId];

  if (!gitPlatform) {
    throw new UnsupportedGitPlatformError({
      platformId,
      repositoryPath,
    });
  }

  return gitPlatform;
};

export const normalizeRepositoryUrl = (remoteUrl: string): string | null => {
  return githubPlatformAdapter.normalizeRepositoryUrl(remoteUrl);
};

export const resolvePushRemote = async (args: ResolveGitPlatformPushRemoteArgs) => {
  const gitPlatform = await resolveGitPlatform(args.repositoryPath);
  return gitPlatform.resolvePushRemote(args);
};

export const publishBranch = async (args: PublishGitPlatformBranchArgs) => {
  const gitPlatform = await resolveGitPlatform(args.repositoryPath);
  return gitPlatform.publishBranch(args);
};

export const synchronizePullRequest = async (args: SynchronizeGitPlatformPullRequestArgs) => {
  const gitPlatform = await resolveGitPlatform(args.repositoryPath);
  return gitPlatform.synchronizePullRequest(args);
};
