export type GitPlatformId = "github";

export type ResolveGitPlatformPushRemoteArgs = {
  repositoryPath: string;
  remoteName?: string;
};

export type GitPlatformPushRemote = {
  remoteName: string;
  fetchUrl: string;
  pushUrl: string;
  repositoryUrl: string;
};

export type PublishGitPlatformBranchArgs = {
  repositoryPath: string;
  branchName: string;
  commitHash: string;
  remoteName?: string;
  pushedAt?: string;
};

export type GitPlatformPublishedBranch = {
  remoteName: string;
  repositoryUrl: string;
  branchUrl: string;
  commitUrl: string;
  commitHash: string;
  pushedAt: string;
};

export type SynchronizeGitPlatformPullRequestArgs = {
  repositoryPath: string;
  branchName: string;
  baseBranch: string;
  title: string;
  body: string;
  draft?: boolean;
  remoteName?: string;
};

export type GitPlatformPullRequest = {
  url: string;
};

export type GitPlatformAdapter = {
  id: GitPlatformId;
  normalizeRepositoryUrl: (remoteUrl: string) => string | null;
  resolvePushRemote: (args: ResolveGitPlatformPushRemoteArgs) => Promise<GitPlatformPushRemote>;
  publishBranch: (args: PublishGitPlatformBranchArgs) => Promise<GitPlatformPublishedBranch>;
  synchronizePullRequest: (
    args: SynchronizeGitPlatformPullRequestArgs,
  ) => Promise<GitPlatformPullRequest>;
};
