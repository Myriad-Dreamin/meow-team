import "server-only";

import { githubPlatformAdapter } from "@/lib/platform/gh";
import type {
  GitPlatformAdapter,
  PublishGitPlatformBranchArgs,
  ResolveGitPlatformPushRemoteArgs,
  SynchronizeGitPlatformPullRequestArgs,
} from "@/lib/platform/types";

export * from "@/lib/platform/types";

export const gitPlatform: GitPlatformAdapter = githubPlatformAdapter;

export const normalizeRepositoryUrl = (remoteUrl: string): string | null => {
  return gitPlatform.normalizeRepositoryUrl(remoteUrl);
};

export const resolvePushRemote = (args: ResolveGitPlatformPushRemoteArgs) => {
  return gitPlatform.resolvePushRemote(args);
};

export const publishBranch = (args: PublishGitPlatformBranchArgs) => {
  return gitPlatform.publishBranch(args);
};

export const synchronizePullRequest = (args: SynchronizeGitPlatformPullRequestArgs) => {
  return gitPlatform.synchronizePullRequest(args);
};
