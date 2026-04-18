import "server-only";

import { readRepositoryPlatformId } from "@/lib/repository-config";
import { githubPlatformAdapter } from "@/lib/platform/gh";
import type { GitPlatformAdapter, GitPlatformId } from "@/lib/platform/types";

export class UnsupportedGitPlatformError extends Error {
  platformId: GitPlatformId;
  repositoryPath: string;

  constructor({
    platformId,
    repositoryPath,
  }: {
    platformId: GitPlatformId;
    repositoryPath: string;
  }) {
    super(
      `Git platform "${platformId}" is configured for ${repositoryPath}, but that platform is not supported yet.`,
    );
    this.name = "UnsupportedGitPlatformError";
    this.platformId = platformId;
    this.repositoryPath = repositoryPath;
  }
}

export const resolveRepositoryGitPlatformId = async (
  repositoryPath: string,
): Promise<GitPlatformId> => {
  return (await readRepositoryPlatformId(repositoryPath)) ?? "github";
};

export const resolveGitPlatformAdapter = async (
  repositoryPath: string,
): Promise<GitPlatformAdapter> => {
  const platformId = await resolveRepositoryGitPlatformId(repositoryPath);

  switch (platformId) {
    case "github":
      return githubPlatformAdapter;
    case "ugit":
      throw new UnsupportedGitPlatformError({
        platformId,
        repositoryPath,
      });
  }
};
