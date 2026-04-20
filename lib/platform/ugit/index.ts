import "server-only";

import path from "node:path";
import { runGit } from "@/lib/cli-tools/git";
import { listGitWorktrees } from "@/lib/git/ops";
import { runUgit } from "@/lib/platform/ugit/cli";
import type {
  GitPlatformAdapter,
  GitPlatformPublishedBranch,
  GitPlatformPullRequest,
  GitPlatformPushRemote,
  PublishGitPlatformBranchArgs,
  ResolveGitPlatformPushRemoteArgs,
  SynchronizeGitPlatformPullRequestArgs,
} from "@/lib/platform/types";

const DEFAULT_PUSH_REMOTE_NAME = "origin";

type UgitPullRequestSummary = {
  id: number;
  state: "open" | "merged";
  baseBranch: string;
  branchName: string;
  title: string;
};

const trimGitSuffix = (value: string): string => {
  return value.replace(/\.git$/iu, "");
};

const trimTrailingSlashes = (value: string): string => {
  return value.replace(/\/+$/u, "");
};

const appendRepositoryFragment = (repositoryUrl: string, fragment: string): string => {
  return `${repositoryUrl}#${fragment}`;
};

export const normalizeUgitRepositoryUrl = (remoteUrl: string): string | null => {
  const trimmedRemoteUrl = remoteUrl.trim();
  if (!trimmedRemoteUrl) {
    return null;
  }

  if (path.isAbsolute(trimmedRemoteUrl)) {
    return trimTrailingSlashes(trimGitSuffix(path.normalize(trimmedRemoteUrl)));
  }

  try {
    const parsedUrl = new URL(trimmedRemoteUrl);
    parsedUrl.pathname = trimTrailingSlashes(trimGitSuffix(decodeURIComponent(parsedUrl.pathname)));
    return trimTrailingSlashes(parsedUrl.toString());
  } catch {
    return null;
  }
};

export const resolveUgitPushRemote = async ({
  repositoryPath,
  remoteName = DEFAULT_PUSH_REMOTE_NAME,
}: ResolveGitPlatformPushRemoteArgs): Promise<GitPlatformPushRemote> => {
  const { stdout: fetchUrl } = await runGit(repositoryPath, ["remote", "get-url", remoteName]);
  const { stdout: pushUrl } = await runGit(repositoryPath, [
    "remote",
    "get-url",
    "--push",
    remoteName,
  ]);
  const repositoryUrl = normalizeUgitRepositoryUrl(pushUrl) ?? normalizeUgitRepositoryUrl(fetchUrl);

  if (!repositoryUrl) {
    throw new Error(
      `Git remote ${remoteName} does not expose a ugit repository URL for branch publishing.`,
    );
  }

  return {
    remoteName,
    fetchUrl,
    pushUrl,
    repositoryUrl,
  };
};

export const publishUgitBranch = async ({
  repositoryPath,
  branchName,
  commitHash,
  remoteName = DEFAULT_PUSH_REMOTE_NAME,
  pushedAt = new Date().toISOString(),
}: PublishGitPlatformBranchArgs): Promise<GitPlatformPublishedBranch> => {
  const remote = await resolveUgitPushRemote({
    repositoryPath,
    remoteName,
  });

  await runGit(repositoryPath, [
    "push",
    "--force-with-lease",
    "--set-upstream",
    remote.remoteName,
    `HEAD:${branchName}`,
  ]);

  return {
    remoteName: remote.remoteName,
    repositoryUrl: remote.repositoryUrl,
    branchUrl: appendRepositoryFragment(
      remote.repositoryUrl,
      `branch=${encodeURIComponent(branchName)}`,
    ),
    commitUrl: appendRepositoryFragment(remote.repositoryUrl, `commit=${commitHash}`),
    commitHash,
    pushedAt,
  };
};

const parseUgitPullRequestTable = (stdout: string): UgitPullRequestSummary[] => {
  const trimmedOutput = stdout.trim();
  if (!trimmedOutput || /^No pull requests found\b/iu.test(trimmedOutput)) {
    return [];
  }

  return trimmedOutput
    .split("\n")
    .slice(2)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, state, , baseBranch, branchName, title] = line.split(/\s{2,}/u, 6);

      if (!id || !state || !baseBranch || !branchName || !title) {
        throw new Error(`Unable to parse ugit pull-request row "${line}".`);
      }

      if (state !== "open" && state !== "merged") {
        throw new Error(`Unexpected ugit pull-request state "${state}" in "${line}".`);
      }

      return {
        id: Number.parseInt(id, 10),
        state: state as UgitPullRequestSummary["state"],
        baseBranch,
        branchName,
        title,
      };
    })
    .filter((pullRequest) => Number.isInteger(pullRequest.id) && pullRequest.id > 0);
};

const findUgitPullRequest = async ({
  repositoryPath,
  branchName,
  baseBranch,
}: {
  repositoryPath: string;
  branchName: string;
  baseBranch: string;
}): Promise<UgitPullRequestSummary | null> => {
  const { stdout } = await runUgit(repositoryPath, [
    "pr",
    "list",
    "--state",
    "all",
    "--base",
    baseBranch,
    "--head",
    branchName,
  ]);

  return parseUgitPullRequestTable(stdout)[0] ?? null;
};

const parseUgitPullRequestId = (stdout: string): number | null => {
  const match = /pull request #(\d+)/iu.exec(stdout);
  return match ? Number.parseInt(match[1] ?? "", 10) : null;
};

const buildUgitPullRequestUrl = (repositoryUrl: string, pullRequestId: number): string => {
  return appendRepositoryFragment(repositoryUrl, `pull-request=${pullRequestId}`);
};

const assertSupportedUgitPullRequestRemote = (remoteName: string): void => {
  if (remoteName === DEFAULT_PUSH_REMOTE_NAME) {
    return;
  }

  throw new Error(
    `ugit pull-request synchronization only supports the "${DEFAULT_PUSH_REMOTE_NAME}" remote because the ugit CLI does not expose a remote selector for pr operations.`,
  );
};

const resolveUgitPullRequestRepositoryPath = async ({
  repositoryPath,
  branchName,
  baseBranch,
}: Pick<
  SynchronizeGitPlatformPullRequestArgs,
  "repositoryPath" | "branchName" | "baseBranch"
>): Promise<string> => {
  const worktrees = await listGitWorktrees(repositoryPath);
  const pullRequestRepositoryPath = worktrees.find(
    (worktree) => worktree.branchName === branchName,
  )?.worktreePath;

  if (pullRequestRepositoryPath) {
    return pullRequestRepositoryPath;
  }

  throw new Error(
    `ugit pull-request synchronization requires branch "${branchName}" to be checked out in a worktree so ugit can target "${baseBranch}" without inferring the wrong source branch.`,
  );
};

const buildUgitPullRequestMutationArgs = ({
  baseBranch,
  title,
  body,
  draft,
}: Pick<
  SynchronizeGitPlatformPullRequestArgs,
  "baseBranch" | "title" | "body" | "draft"
>): string[] => {
  return ["--base", baseBranch, "--title", title, "--body", body, ...(draft ? ["--draft"] : [])];
};

export const synchronizeUgitPullRequest = async ({
  repositoryPath,
  branchName,
  baseBranch,
  title,
  body,
  draft = false,
  remoteName = DEFAULT_PUSH_REMOTE_NAME,
}: SynchronizeGitPlatformPullRequestArgs): Promise<GitPlatformPullRequest> => {
  assertSupportedUgitPullRequestRemote(remoteName);
  const pullRequestRepositoryPath = await resolveUgitPullRequestRepositoryPath({
    repositoryPath,
    branchName,
    baseBranch,
  });
  const remote = await resolveUgitPushRemote({
    repositoryPath: pullRequestRepositoryPath,
    remoteName,
  });
  const existingPullRequest = await findUgitPullRequest({
    repositoryPath: pullRequestRepositoryPath,
    branchName,
    baseBranch,
  });

  if (existingPullRequest) {
    if (existingPullRequest.state === "merged") {
      throw new Error(
        `ugit pull request ${buildUgitPullRequestUrl(remote.repositoryUrl, existingPullRequest.id)} is already merged and cannot be refreshed.`,
      );
    }

    await runUgit(pullRequestRepositoryPath, [
      "pr",
      "sync",
      ...buildUgitPullRequestMutationArgs({
        baseBranch,
        title,
        body,
        draft,
      }),
    ]);

    return {
      url: buildUgitPullRequestUrl(remote.repositoryUrl, existingPullRequest.id),
    };
  }

  const { stdout } = await runUgit(pullRequestRepositoryPath, [
    "pr",
    "create",
    ...buildUgitPullRequestMutationArgs({
      baseBranch,
      title,
      body,
      draft,
    }),
  ]);
  const createdPullRequestId = parseUgitPullRequestId(stdout);

  if (!createdPullRequestId) {
    throw new Error(
      `ugit pull-request creation completed, but the pull request for ${branchName} could not be resolved afterwards.`,
    );
  }

  return {
    url: buildUgitPullRequestUrl(remote.repositoryUrl, createdPullRequestId),
  };
};

export const ugitPlatformAdapter: GitPlatformAdapter = {
  id: "ugit",
  normalizeRepositoryUrl: normalizeUgitRepositoryUrl,
  resolvePushRemote: resolveUgitPushRemote,
  publishBranch: publishUgitBranch,
  synchronizePullRequest: synchronizeUgitPullRequest,
};
