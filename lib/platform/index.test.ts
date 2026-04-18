import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  readRepositoryPlatformIdMock,
  normalizeRepositoryUrlMock,
  resolvePushRemoteMock,
  publishBranchMock,
  synchronizePullRequestMock,
} = vi.hoisted(() => ({
  readRepositoryPlatformIdMock: vi.fn(),
  normalizeRepositoryUrlMock: vi.fn(),
  resolvePushRemoteMock: vi.fn(),
  publishBranchMock: vi.fn(),
  synchronizePullRequestMock: vi.fn(),
}));

vi.mock("@/lib/repository-config", () => ({
  readRepositoryPlatformId: readRepositoryPlatformIdMock,
}));

vi.mock("@/lib/platform/gh", () => ({
  githubPlatformAdapter: {
    id: "github",
    normalizeRepositoryUrl: normalizeRepositoryUrlMock,
    resolvePushRemote: resolvePushRemoteMock,
    publishBranch: publishBranchMock,
    synchronizePullRequest: synchronizePullRequestMock,
  },
}));

import {
  publishBranch,
  resolvePushRemote,
  synchronizePullRequest,
  UnsupportedGitPlatformError,
} from "@/lib/platform";

beforeEach(() => {
  readRepositoryPlatformIdMock.mockReset();
  normalizeRepositoryUrlMock.mockReset();
  resolvePushRemoteMock.mockReset();
  publishBranchMock.mockReset();
  synchronizePullRequestMock.mockReset();
});

describe("platform resolution", () => {
  it("defaults to the GitHub adapter when no repository config is set", async () => {
    readRepositoryPlatformIdMock.mockResolvedValue(null);
    resolvePushRemoteMock.mockResolvedValue({
      remoteName: "origin",
      fetchUrl: "https://github.com/example/repository.git",
      pushUrl: "https://github.com/example/repository.git",
      repositoryUrl: "https://github.com/example/repository",
    });

    await expect(resolvePushRemote({ repositoryPath: "/repo" })).resolves.toEqual({
      remoteName: "origin",
      fetchUrl: "https://github.com/example/repository.git",
      pushUrl: "https://github.com/example/repository.git",
      repositoryUrl: "https://github.com/example/repository",
    });

    expect(readRepositoryPlatformIdMock).toHaveBeenCalledWith("/repo");
    expect(resolvePushRemoteMock).toHaveBeenCalledWith({ repositoryPath: "/repo" });
  });

  it("uses the GitHub adapter when github is configured explicitly", async () => {
    readRepositoryPlatformIdMock.mockResolvedValue("github");
    publishBranchMock.mockResolvedValue({
      remoteName: "origin",
      repositoryUrl: "https://github.com/example/repository",
      branchUrl: "https://github.com/example/repository/tree/topic",
      commitUrl: "https://github.com/example/repository/commit/abc123",
      commitHash: "abc123",
      pushedAt: "2026-04-19T00:00:00.000Z",
    });

    await expect(
      publishBranch({
        repositoryPath: "/repo",
        branchName: "topic",
        commitHash: "abc123",
      }),
    ).resolves.toEqual({
      remoteName: "origin",
      repositoryUrl: "https://github.com/example/repository",
      branchUrl: "https://github.com/example/repository/tree/topic",
      commitUrl: "https://github.com/example/repository/commit/abc123",
      commitHash: "abc123",
      pushedAt: "2026-04-19T00:00:00.000Z",
    });

    expect(publishBranchMock).toHaveBeenCalledWith({
      repositoryPath: "/repo",
      branchName: "topic",
      commitHash: "abc123",
    });
  });

  it("fails explicitly for ugit without falling back to GitHub behavior", async () => {
    readRepositoryPlatformIdMock.mockResolvedValue("ugit");

    await expect(resolvePushRemote({ repositoryPath: "/repo" })).rejects.toBeInstanceOf(
      UnsupportedGitPlatformError,
    );
    await expect(
      publishBranch({
        repositoryPath: "/repo",
        branchName: "topic",
        commitHash: "abc123",
      }),
    ).rejects.toThrow('Git platform "ugit"');
    await expect(
      synchronizePullRequest({
        repositoryPath: "/repo",
        branchName: "topic",
        baseBranch: "main",
        title: "Title",
        body: "Body",
      }),
    ).rejects.toThrow('Git platform "ugit"');

    expect(resolvePushRemoteMock).not.toHaveBeenCalled();
    expect(publishBranchMock).not.toHaveBeenCalled();
    expect(synchronizePullRequestMock).not.toHaveBeenCalled();
  });
});
