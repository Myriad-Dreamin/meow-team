import { beforeEach, describe, expect, it, vi } from "vitest";

const { runGitMock, runUgitMock } = vi.hoisted(() => ({
  runGitMock: vi.fn(),
  runUgitMock: vi.fn(),
}));

vi.mock("@/lib/cli-tools/git", () => ({
  runGit: runGitMock,
}));

vi.mock("@/lib/platform/ugit/cli", () => ({
  runUgit: runUgitMock,
}));

import {
  normalizeUgitRepositoryUrl,
  publishUgitBranch,
  synchronizeUgitPullRequest,
} from "@/lib/platform/ugit";

beforeEach(() => {
  runGitMock.mockReset();
  runUgitMock.mockReset();
});

describe("normalizeUgitRepositoryUrl", () => {
  it("normalizes ssh and local ugit remotes", () => {
    expect(
      normalizeUgitRepositoryUrl("ssh://ugit.example.test/srv/ugit/.data/repos/meow-team.git"),
    ).toBe("ssh://ugit.example.test/srv/ugit/.data/repos/meow-team");
    expect(normalizeUgitRepositoryUrl("/srv/ugit/.data/repos/meow-team.git")).toBe(
      "/srv/ugit/.data/repos/meow-team",
    );
  });
});

describe("publishUgitBranch", () => {
  it("pushes the branch and returns ugit publication metadata", async () => {
    runGitMock
      .mockResolvedValueOnce({
        stdout: "ssh://ugit.example.test/srv/ugit/.data/repos/meow-team.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "ssh://ugit.example.test/srv/ugit/.data/repos/meow-team.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "",
      });

    await expect(
      publishUgitBranch({
        repositoryPath: "/repo",
        branchName: "feature/test",
        commitHash: "abcdef1234567890",
        pushedAt: "2026-04-20T00:00:00.000Z",
      }),
    ).resolves.toEqual({
      remoteName: "origin",
      repositoryUrl: "ssh://ugit.example.test/srv/ugit/.data/repos/meow-team",
      branchUrl: "ssh://ugit.example.test/srv/ugit/.data/repos/meow-team#branch=feature%2Ftest",
      commitUrl: "ssh://ugit.example.test/srv/ugit/.data/repos/meow-team#commit=abcdef1234567890",
      commitHash: "abcdef1234567890",
      pushedAt: "2026-04-20T00:00:00.000Z",
    });

    expect(runGitMock).toHaveBeenNthCalledWith(1, "/repo", ["remote", "get-url", "origin"]);
    expect(runGitMock).toHaveBeenNthCalledWith(2, "/repo", [
      "remote",
      "get-url",
      "--push",
      "origin",
    ]);
    expect(runGitMock).toHaveBeenNthCalledWith(3, "/repo", [
      "push",
      "--force-with-lease",
      "--set-upstream",
      "origin",
      "HEAD:feature/test",
    ]);
  });
});

describe("synchronizeUgitPullRequest", () => {
  it("creates a pull request from the dedicated branch worktree when none exists yet", async () => {
    runGitMock
      .mockResolvedValueOnce({
        stdout: [
          "worktree /repo",
          "branch refs/heads/main",
          "",
          "worktree /worktrees/feature-test",
          "branch refs/heads/feature/test",
        ].join("\n"),
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "ssh://ugit.example.test/srv/ugit/.data/repos/meow-team.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "ssh://ugit.example.test/srv/ugit/.data/repos/meow-team.git",
        stderr: "",
      });
    runUgitMock
      .mockResolvedValueOnce({
        stdout: "No pull requests found in meow-team.",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "Created pull request #7 for meow-team:feature/test -> main.",
        stderr: "",
      });

    await expect(
      synchronizeUgitPullRequest({
        repositoryPath: "/repo",
        branchName: "feature/test",
        baseBranch: "main",
        title: "Add ugit adapter",
        body: "Body",
        draft: true,
      }),
    ).resolves.toEqual({
      url: "ssh://ugit.example.test/srv/ugit/.data/repos/meow-team#pull-request=7",
    });

    expect(runGitMock).toHaveBeenNthCalledWith(1, "/repo", ["worktree", "list", "--porcelain"]);
    expect(runGitMock).toHaveBeenNthCalledWith(2, "/worktrees/feature-test", [
      "remote",
      "get-url",
      "origin",
    ]);
    expect(runGitMock).toHaveBeenNthCalledWith(3, "/worktrees/feature-test", [
      "remote",
      "get-url",
      "--push",
      "origin",
    ]);
    expect(runUgitMock).toHaveBeenNthCalledWith(1, "/worktrees/feature-test", [
      "pr",
      "list",
      "--state",
      "all",
      "--base",
      "main",
      "--head",
      "feature/test",
    ]);
    expect(runUgitMock).toHaveBeenNthCalledWith(2, "/worktrees/feature-test", [
      "pr",
      "create",
      "--base",
      "main",
      "--title",
      "Add ugit adapter",
      "--body",
      "Body",
      "--draft",
    ]);
  });

  it("syncs an existing pull request from the dedicated branch worktree", async () => {
    runGitMock
      .mockResolvedValueOnce({
        stdout: [
          "worktree /repo",
          "branch refs/heads/main",
          "",
          "worktree /worktrees/feature-test",
          "branch refs/heads/feature/test",
        ].join("\n"),
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "ssh://ugit.example.test/srv/ugit/.data/repos/meow-team.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "ssh://ugit.example.test/srv/ugit/.data/repos/meow-team.git",
        stderr: "",
      });
    runUgitMock
      .mockResolvedValueOnce({
        stdout: [
          "Pull requests for meow-team:",
          "ID  State  CI      Base  Head          Title",
          "7   open   queued  main  feature/test  [draft] Add ugit adapter",
        ].join("\n"),
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "Synchronized meow-team:feature/test -> main.",
        stderr: "",
      });

    await expect(
      synchronizeUgitPullRequest({
        repositoryPath: "/repo",
        branchName: "feature/test",
        baseBranch: "main",
        title: "Add ugit adapter",
        body: "Body",
        draft: false,
      }),
    ).resolves.toEqual({
      url: "ssh://ugit.example.test/srv/ugit/.data/repos/meow-team#pull-request=7",
    });

    expect(runUgitMock).toHaveBeenNthCalledWith(1, "/worktrees/feature-test", [
      "pr",
      "list",
      "--state",
      "all",
      "--base",
      "main",
      "--head",
      "feature/test",
    ]);
    expect(runUgitMock).toHaveBeenNthCalledWith(2, "/worktrees/feature-test", [
      "pr",
      "sync",
      "--base",
      "main",
      "--title",
      "Add ugit adapter",
      "--body",
      "Body",
    ]);
  });

  it("uses the dedicated branch worktree without passing unsupported head flags", async () => {
    runGitMock
      .mockResolvedValueOnce({
        stdout: [
          "worktree /repo",
          "branch refs/heads/main",
          "",
          "worktree /worktrees/feature-test",
          "branch refs/heads/feature/test",
        ].join("\n"),
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "ssh://ugit.example.test/srv/ugit/.data/repos/meow-team.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "ssh://ugit.example.test/srv/ugit/.data/repos/meow-team.git",
        stderr: "",
      });
    runUgitMock
      .mockResolvedValueOnce({
        stdout: "No pull requests found in meow-team.",
        stderr: "",
      })
      .mockImplementationOnce(async (_repositoryPath: string, args: string[]) => {
        if (args.includes("--head")) {
          throw new Error("unknown option --head");
        }

        return {
          stdout: "Created pull request #7 for meow-team:feature/test -> main.",
          stderr: "",
        };
      });

    await expect(
      synchronizeUgitPullRequest({
        repositoryPath: "/repo",
        branchName: "feature/test",
        baseBranch: "main",
        title: "Add ugit adapter",
        body: "Body",
      }),
    ).resolves.toEqual({
      url: "ssh://ugit.example.test/srv/ugit/.data/repos/meow-team#pull-request=7",
    });

    expect(runUgitMock).toHaveBeenNthCalledWith(2, "/worktrees/feature-test", [
      "pr",
      "create",
      "--base",
      "main",
      "--title",
      "Add ugit adapter",
      "--body",
      "Body",
    ]);
  });

  it("fails clearly when the dedicated branch is not checked out in any worktree", async () => {
    runGitMock.mockResolvedValueOnce({
      stdout: ["worktree /repo", "branch refs/heads/main"].join("\n"),
      stderr: "",
    });

    await expect(
      synchronizeUgitPullRequest({
        repositoryPath: "/repo",
        branchName: "feature/test",
        baseBranch: "main",
        title: "Add ugit adapter",
        body: "Body",
      }),
    ).rejects.toThrow(
      'ugit pull-request synchronization requires branch "feature/test" to be checked out in a worktree',
    );

    expect(runUgitMock).not.toHaveBeenCalled();
  });

  it("rejects non-origin remotes before invoking ugit pull-request commands", async () => {
    await expect(
      synchronizeUgitPullRequest({
        repositoryPath: "/repo",
        remoteName: "upstream",
        branchName: "feature/test",
        baseBranch: "main",
        title: "Add ugit adapter",
        body: "Body",
      }),
    ).rejects.toThrow('ugit pull-request synchronization only supports the "origin" remote');

    expect(runGitMock).not.toHaveBeenCalled();
    expect(runUgitMock).not.toHaveBeenCalled();
  });
});
