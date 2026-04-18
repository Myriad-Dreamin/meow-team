import "server-only";

import { githubPlatformAdapter } from "@/lib/platform/gh";
import { resolveGitPlatformAdapter } from "@/lib/platform/adapter";
import type {
  PublishGitPlatformBranchArgs,
  ResolveGitPlatformPushRemoteArgs,
  SynchronizeGitPlatformPullRequestArgs,
} from "@/lib/platform/types";

export * from "@/lib/platform/types";
export * from "@/lib/platform/adapter";

export const normalizeRepositoryUrl = (remoteUrl: string): string | null => {
  return githubPlatformAdapter.normalizeRepositoryUrl(remoteUrl);
};

export const resolvePushRemote = async (args: ResolveGitPlatformPushRemoteArgs) => {
  return (await resolveGitPlatformAdapter(args.repositoryPath)).resolvePushRemote(args);
};

export const publishBranch = async (args: PublishGitPlatformBranchArgs) => {
  return (await resolveGitPlatformAdapter(args.repositoryPath)).publishBranch(args);
};

export const synchronizePullRequest = async (args: SynchronizeGitPlatformPullRequestArgs) => {
  return (await resolveGitPlatformAdapter(args.repositoryPath)).synchronizePullRequest(args);
};
