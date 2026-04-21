import "server-only";

import { z } from "zod";
import { runGit } from "@/lib/cli-tools/git";
import { runGh } from "@/lib/platform/gh/cli";
import {
  normalizeHostedRepositorySlug,
  normalizeHostedRepositoryUrl,
} from "@/lib/platform/repository-url";
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

export const normalizeGitHubRepositoryUrl = normalizeHostedRepositoryUrl;

export const resolveGitHubPushRemote = async ({
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
  const repositoryUrl =
    normalizeGitHubRepositoryUrl(pushUrl) ?? normalizeGitHubRepositoryUrl(fetchUrl);

  if (!repositoryUrl) {
    throw new Error(
      `Git remote ${remoteName} does not expose a GitHub repository URL for commit publishing.`,
    );
  }

  return {
    remoteName,
    fetchUrl,
    pushUrl,
    repositoryUrl,
  };
};

const encodeGitHubRef = (value: string): string => {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
};

export const publishGitHubBranch = async ({
  repositoryPath,
  branchName,
  commitHash,
  remoteName = DEFAULT_PUSH_REMOTE_NAME,
  pushedAt = new Date().toISOString(),
}: PublishGitPlatformBranchArgs): Promise<GitPlatformPublishedBranch> => {
  const remote = await resolveGitHubPushRemote({
    repositoryPath,
    remoteName,
  });

  await runGit(repositoryPath, [
    "push",
    "--force-with-lease",
    "--set-upstream",
    remote.remoteName,
    `${branchName}:${branchName}`,
  ]);

  return {
    remoteName: remote.remoteName,
    repositoryUrl: remote.repositoryUrl,
    branchUrl: `${remote.repositoryUrl}/tree/${encodeGitHubRef(branchName)}`,
    commitUrl: `${remote.repositoryUrl}/commit/${commitHash}`,
    commitHash,
    pushedAt,
  };
};

const normalizeGitHubRepositorySlug = (repositoryUrl: string): string | null => {
  return normalizeHostedRepositorySlug(repositoryUrl);
};

const getGitHubRepositoryOwner = (repositorySlug: string): string | null => {
  const [owner] = repositorySlug.split("/", 1);
  return owner?.trim() ? owner : null;
};

type GitHubPullRequestView = {
  number: number;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
};

const gitHubPullRequestViewSchema = z.object({
  number: z.number().int().positive(),
  url: z.string().trim().min(1),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  isDraft: z.boolean().optional().default(false),
});

const listGitHubPullRequests = async ({
  repositoryPath,
  baseRepositorySlug,
  headSelector,
  baseBranch,
}: {
  repositoryPath: string;
  baseRepositorySlug: string;
  headSelector: string;
  baseBranch: string;
}): Promise<GitHubPullRequestView[]> => {
  const { stdout } = await runGh(repositoryPath, [
    "pr",
    "list",
    "--repo",
    baseRepositorySlug,
    "--base",
    baseBranch,
    "--head",
    headSelector,
    "--state",
    "all",
    "--json",
    "number,url,state,isDraft",
  ]);

  return z.array(gitHubPullRequestViewSchema).parse(JSON.parse(stdout || "[]"));
};

export const synchronizeGitHubPullRequest = async ({
  repositoryPath,
  branchName,
  baseBranch,
  title,
  body,
  draft = false,
  remoteName = DEFAULT_PUSH_REMOTE_NAME,
}: SynchronizeGitPlatformPullRequestArgs): Promise<GitPlatformPullRequest> => {
  const remote = await resolveGitHubPushRemote({
    repositoryPath,
    remoteName,
  });
  const baseRepositorySlug =
    normalizeGitHubRepositorySlug(remote.fetchUrl) ??
    normalizeGitHubRepositorySlug(remote.pushUrl) ??
    normalizeGitHubRepositorySlug(remote.repositoryUrl);
  const headRepositorySlug =
    normalizeGitHubRepositorySlug(remote.pushUrl) ??
    normalizeGitHubRepositorySlug(remote.fetchUrl) ??
    normalizeGitHubRepositorySlug(remote.repositoryUrl);

  if (!baseRepositorySlug || !headRepositorySlug) {
    throw new Error(
      "Git remote does not expose enough GitHub repository metadata to create a pull request.",
    );
  }

  const headOwner = getGitHubRepositoryOwner(headRepositorySlug);
  if (!headOwner) {
    throw new Error(`GitHub repository slug ${headRepositorySlug} does not include an owner.`);
  }

  const headSelector =
    baseRepositorySlug === headRepositorySlug ? branchName : `${headOwner}:${branchName}`;
  const existingPullRequest = (
    await listGitHubPullRequests({
      repositoryPath,
      baseRepositorySlug,
      headSelector,
      baseBranch,
    })
  )[0];

  if (existingPullRequest) {
    if (existingPullRequest.state === "MERGED") {
      throw new Error(
        `GitHub pull request ${existingPullRequest.url} is already merged and cannot be refreshed.`,
      );
    }

    if (existingPullRequest.state === "CLOSED") {
      await runGh(repositoryPath, [
        "pr",
        "reopen",
        existingPullRequest.number.toString(),
        "--repo",
        baseRepositorySlug,
      ]);
    }

    await runGh(repositoryPath, [
      "pr",
      "edit",
      existingPullRequest.number.toString(),
      "--repo",
      baseRepositorySlug,
      "--title",
      title,
      "--body",
      body,
      "--base",
      baseBranch,
    ]);

    if (!draft && existingPullRequest.isDraft) {
      await runGh(repositoryPath, [
        "pr",
        "ready",
        existingPullRequest.number.toString(),
        "--repo",
        baseRepositorySlug,
      ]);
    }

    const refreshedPullRequest = (
      await listGitHubPullRequests({
        repositoryPath,
        baseRepositorySlug,
        headSelector,
        baseBranch,
      })
    )[0];

    if (!refreshedPullRequest) {
      throw new Error(
        `GitHub pull request refresh completed, but the pull request for ${branchName} could not be resolved afterwards.`,
      );
    }

    return {
      url: refreshedPullRequest.url,
    };
  }

  const { stdout } = await runGh(repositoryPath, [
    "pr",
    "create",
    "--repo",
    baseRepositorySlug,
    "--base",
    baseBranch,
    "--head",
    headSelector,
    "--title",
    title,
    "--body",
    body,
    ...(draft ? ["--draft"] : []),
  ]);

  const createdPullRequest = (
    await listGitHubPullRequests({
      repositoryPath,
      baseRepositorySlug,
      headSelector,
      baseBranch,
    })
  )[0];

  if (createdPullRequest) {
    return {
      url: createdPullRequest.url,
    };
  }

  const fallbackUrl = stdout
    .split(/\s+/u)
    .map((value) => value.trim())
    .find((value) => /^https?:\/\//u.test(value));
  if (!fallbackUrl) {
    throw new Error(
      `GitHub pull request creation completed, but the pull request for ${branchName} could not be resolved afterwards.`,
    );
  }

  return {
    url: fallbackUrl,
  };
};

export const githubPlatformAdapter: GitPlatformAdapter = {
  id: "github",
  normalizeRepositoryUrl: normalizeGitHubRepositoryUrl,
  resolvePushRemote: resolveGitHubPushRemote,
  publishBranch: publishGitHubBranch,
  synchronizePullRequest: synchronizeGitHubPullRequest,
};
