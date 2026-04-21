import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveRepositoryUgitBrowserBaseUrlMock, runGitMock, runUgitMock } = vi.hoisted(() => ({
  resolveRepositoryUgitBrowserBaseUrlMock: vi.fn(),
  runGitMock: vi.fn(),
  runUgitMock: vi.fn(),
}));

vi.mock("@/lib/cli-tools/git", () => ({
  runGit: runGitMock,
}));

vi.mock("@/lib/config/repository", () => ({
  resolveRepositoryUgitBrowserBaseUrl: resolveRepositoryUgitBrowserBaseUrlMock,
}));

vi.mock("@/lib/platform/ugit/cli", () => ({
  runUgit: runUgitMock,
}));

import {
  normalizeUgitRepositoryUrl,
  publishUgitBranch,
  resolveUgitPushRemote,
  synchronizeUgitPullRequest,
} from "@/lib/platform/ugit";

beforeEach(() => {
  runGitMock.mockReset();
  runUgitMock.mockReset();
  resolveRepositoryUgitBrowserBaseUrlMock.mockReset();
  runGitMock.mockImplementation(async (_repositoryPath: string, args: string[]) => {
    throw new Error(`Unexpected runGit call: ${args.join(" ")}`);
  });
  runUgitMock.mockImplementation(async (_repositoryPath: string, args: string[]) => {
    throw new Error(`Unexpected runUgit call: ${args.join(" ")}`);
  });
  resolveRepositoryUgitBrowserBaseUrlMock.mockImplementation(async (cwd = process.cwd()) => ({
    repositoryPath: cwd,
    baseUrl: "http://localhost:17121/",
  }));
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
        stdout: "git@github.com:Myriad-Dreamin/meow-team.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "git@github.com:Myriad-Dreamin/meow-team.git",
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
      repositoryUrl: "http://localhost:17121/Myriad-Dreamin/meow-team",
      branchUrl: "http://localhost:17121/Myriad-Dreamin/meow-team#branch=feature%2Ftest",
      commitUrl: "http://localhost:17121/Myriad-Dreamin/meow-team#commit=abcdef1234567890",
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
    expect(runGitMock).toHaveBeenNthCalledWith(3, "/repo", ["remote", "get-url", "upstream"]);
    expect(runGitMock).toHaveBeenNthCalledWith(4, "/repo", [
      "remote",
      "get-url",
      "--push",
      "upstream",
    ]);
    expect(runGitMock).toHaveBeenNthCalledWith(5, "/repo", [
      "push",
      "--force-with-lease",
      "--set-upstream",
      "origin",
      "feature/test:feature/test",
    ]);
  });
});

describe("resolveUgitPushRemote", () => {
  it("derives the browser repository URL from stable metadata when origin is a local path", async () => {
    runGitMock
      .mockResolvedValueOnce({
        stdout: "/home/kamiyoru/work/ts/ugit/.data/repos/revival.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "/home/kamiyoru/work/ts/ugit/.data/repos/revival.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "git@github.com:Myriad-Dreamin/revival.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "git@github.com:Myriad-Dreamin/revival.git",
        stderr: "",
      });

    await expect(
      resolveUgitPushRemote({
        repositoryPath: "/repo",
      }),
    ).resolves.toEqual({
      remoteName: "origin",
      fetchUrl: "/home/kamiyoru/work/ts/ugit/.data/repos/revival.git",
      pushUrl: "/home/kamiyoru/work/ts/ugit/.data/repos/revival.git",
      repositoryUrl: "http://localhost:17121/Myriad-Dreamin/revival",
    });
  });

  it("uses explicit base-url overrides while keeping ssh origin transport metadata", async () => {
    resolveRepositoryUgitBrowserBaseUrlMock.mockResolvedValueOnce({
      repositoryPath: "/repo",
      baseUrl: "http://ugit.example.test/review/",
    });
    runGitMock
      .mockResolvedValueOnce({
        stdout: "ssh://ugit.example.test/srv/ugit/.data/repos/revival.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "ssh://ugit.example.test/srv/ugit/.data/repos/revival.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "ssh://git@github.com/Myriad-Dreamin/revival.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "ssh://git@github.com/Myriad-Dreamin/revival.git",
        stderr: "",
      });

    await expect(
      resolveUgitPushRemote({
        repositoryPath: "/repo",
      }),
    ).resolves.toEqual({
      remoteName: "origin",
      fetchUrl: "ssh://ugit.example.test/srv/ugit/.data/repos/revival.git",
      pushUrl: "ssh://ugit.example.test/srv/ugit/.data/repos/revival.git",
      repositoryUrl: "http://ugit.example.test/review/Myriad-Dreamin/revival",
    });
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
        stdout: "/srv/ugit/.data/repos/meow-team.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "/srv/ugit/.data/repos/meow-team.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "git@github.com:Myriad-Dreamin/meow-team.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "git@github.com:Myriad-Dreamin/meow-team.git",
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
      url: "http://localhost:17121/Myriad-Dreamin/meow-team/pull-requests/7",
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
    expect(runGitMock).toHaveBeenNthCalledWith(4, "/worktrees/feature-test", [
      "remote",
      "get-url",
      "upstream",
    ]);
    expect(runGitMock).toHaveBeenNthCalledWith(5, "/worktrees/feature-test", [
      "remote",
      "get-url",
      "--push",
      "upstream",
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
      })
      .mockResolvedValueOnce({
        stdout: "git@github.com:Myriad-Dreamin/meow-team.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "git@github.com:Myriad-Dreamin/meow-team.git",
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
      url: "http://localhost:17121/Myriad-Dreamin/meow-team/pull-requests/7",
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
      })
      .mockResolvedValueOnce({
        stdout: "git@github.com:Myriad-Dreamin/meow-team.git",
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: "git@github.com:Myriad-Dreamin/meow-team.git",
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
      url: "http://localhost:17121/Myriad-Dreamin/meow-team/pull-requests/7",
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
