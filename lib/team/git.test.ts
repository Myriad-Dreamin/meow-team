import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCanonicalBranchName,
  buildLaneBranchName,
  buildPlannerWorktreePath,
  parseManagedWorktreeSlot,
  pushLaneBranch,
} from "@/lib/team/git";
import {
  archiveOpenSpecChangeInWorktree,
  getBranchHead,
  normalizeGitHubRepositoryUrl,
  resolveGitHubPushRemote,
  tryRebaseWorktreeBranch,
} from "@/lib/git/ops";

const execFileAsync = promisify(execFile);
const temporaryDirectories = new Set<string>();

const runGit = async (repositoryPath: string, args: string[]): Promise<string> => {
  try {
    const result = await execFileAsync("git", ["-C", repositoryPath, ...args], {
      maxBuffer: 1024 * 1024 * 4,
    });
    return result.stdout.trim();
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
    };
    const output = [nodeError.stderr, nodeError.stdout].filter(Boolean).join("\n").trim();
    throw new Error(output || `git ${args.join(" ")} failed in ${repositoryPath}`);
  }
};

const createRepository = async (): Promise<string> => {
  const repositoryPath = await fs.mkdtemp(path.join(os.tmpdir(), "team-git-test-"));
  temporaryDirectories.add(repositoryPath);
  await runGit(repositoryPath, ["init", "-b", "main"]);
  await runGit(repositoryPath, ["config", "user.name", "Test User"]);
  await runGit(repositoryPath, ["config", "user.email", "test@example.com"]);
  return repositoryPath;
};

const createBareRepository = async (): Promise<string> => {
  const repositoryPath = await fs.mkdtemp(path.join(os.tmpdir(), "team-git-bare-test-"));
  temporaryDirectories.add(repositoryPath);
  await runGit(repositoryPath, ["init", "--bare"]);
  return repositoryPath;
};

const commitAll = async (repositoryPath: string, message: string): Promise<void> => {
  await runGit(repositoryPath, ["add", "-A"]);
  await runGit(repositoryPath, ["commit", "-m", message]);
};

const writeRepositoryFile = async ({
  repositoryPath,
  relativePath,
  content,
}: {
  repositoryPath: string;
  relativePath: string;
  content: string;
}): Promise<void> => {
  const filePath = path.join(repositoryPath, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
};

const createWorktreePath = (): string => {
  const worktreePath = path.join(os.tmpdir(), `team-git-worktree-${randomUUID()}`);
  temporaryDirectories.add(worktreePath);
  return worktreePath;
};

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map(async (directoryPath) => {
      await fs.rm(directoryPath, { recursive: true, force: true });
    }),
  );

  temporaryDirectories.clear();
});

describe("buildPlannerWorktreePath", () => {
  it("reuses the shared meow-N slot path for planner staging", () => {
    expect(
      buildPlannerWorktreePath({
        worktreeRoot: "/tmp/worktrees",
        threadSlot: 1,
      }),
    ).toBe("/tmp/worktrees/meow-1");

    expect(
      buildPlannerWorktreePath({
        worktreeRoot: "/tmp/worktrees",
        threadSlot: 2,
      }),
    ).toBe("/tmp/worktrees/meow-2");
  });
});

describe("parseManagedWorktreeSlot", () => {
  it("extracts a meow-N slot from a managed worktree path", () => {
    expect(
      parseManagedWorktreeSlot({
        worktreeRoot: "/tmp/worktrees",
        worktreePath: "/tmp/worktrees/meow-2",
      }),
    ).toBe(2);
  });

  it("returns null for legacy planner paths and nested paths", () => {
    expect(
      parseManagedWorktreeSlot({
        worktreeRoot: "/tmp/worktrees",
        worktreePath: "/tmp/worktrees/planner-legacy-a1",
      }),
    ).toBeNull();
    expect(
      parseManagedWorktreeSlot({
        worktreeRoot: "/tmp/worktrees",
        worktreePath: "/tmp/worktrees/nested/meow-2",
      }),
    ).toBeNull();
  });
});

describe("buildCanonicalBranchName", () => {
  it("namespaces assignment branches by thread identity when prefixes repeat", () => {
    const slashThreadBranch = buildCanonicalBranchName({
      threadId: "thread/alpha",
      branchPrefix: "parallel-worktrees",
      assignmentNumber: 1,
    });
    const dashThreadBranch = buildCanonicalBranchName({
      threadId: "thread-alpha",
      branchPrefix: "parallel-worktrees",
      assignmentNumber: 1,
    });

    expect(slashThreadBranch).toMatch(/^requests\/parallel-worktrees\/thread-alpha-/);
    expect(slashThreadBranch).toMatch(/\/a1$/);
    expect(dashThreadBranch).toMatch(/^requests\/parallel-worktrees\/thread-alpha-/);
    expect(dashThreadBranch).toMatch(/\/a1$/);
    expect(slashThreadBranch).not.toBe(dashThreadBranch);
  });
});

describe("buildLaneBranchName", () => {
  it("keeps lane branches stable for the same thread assignment", () => {
    expect(
      buildLaneBranchName({
        threadId: "thread-alpha",
        branchPrefix: "parallel-worktrees",
        assignmentNumber: 1,
        laneIndex: 2,
      }),
    ).toBe(
      buildLaneBranchName({
        threadId: "thread-alpha",
        branchPrefix: "parallel-worktrees",
        assignmentNumber: 1,
        laneIndex: 2,
      }),
    );
  });
});

describe("normalizeGitHubRepositoryUrl", () => {
  it("normalizes common GitHub remote URL formats to web URLs", () => {
    expect(normalizeGitHubRepositoryUrl("https://github.com/example/repository.git")).toBe(
      "https://github.com/example/repository",
    );
    expect(normalizeGitHubRepositoryUrl("git@github.com:example/repository.git")).toBe(
      "https://github.com/example/repository",
    );
    expect(normalizeGitHubRepositoryUrl("ssh://git@github.com/example/repository.git")).toBe(
      "https://github.com/example/repository",
    );
  });

  it("rejects non-GitHub-style repository remotes", () => {
    expect(normalizeGitHubRepositoryUrl("/tmp/repository.git")).toBeNull();
    expect(normalizeGitHubRepositoryUrl("file:///tmp/repository.git")).toBeNull();
  });
});

describe("resolveGitHubPushRemote", () => {
  it("keeps the push target and the GitHub web URL separate", async () => {
    const repositoryPath = await createRepository();
    const bareRemotePath = await createBareRepository();

    await runGit(repositoryPath, [
      "remote",
      "add",
      "origin",
      "https://github.com/example/meow-team.git",
    ]);
    await runGit(repositoryPath, ["remote", "set-url", "--push", "origin", bareRemotePath]);

    await expect(
      resolveGitHubPushRemote({
        repositoryPath,
      }),
    ).resolves.toEqual({
      remoteName: "origin",
      fetchUrl: "https://github.com/example/meow-team.git",
      pushUrl: bareRemotePath,
      repositoryUrl: "https://github.com/example/meow-team",
    });
  });

  it("prefers the push URL when fetch and push point at different GitHub repositories", async () => {
    const repositoryPath = await createRepository();

    await runGit(repositoryPath, [
      "remote",
      "add",
      "origin",
      "https://github.com/example/upstream-repository.git",
    ]);
    await runGit(repositoryPath, [
      "remote",
      "set-url",
      "--push",
      "origin",
      "git@github.com:example/fork-repository.git",
    ]);

    await expect(
      resolveGitHubPushRemote({
        repositoryPath,
      }),
    ).resolves.toEqual({
      remoteName: "origin",
      fetchUrl: "https://github.com/example/upstream-repository.git",
      pushUrl: "git@github.com:example/fork-repository.git",
      repositoryUrl: "https://github.com/example/fork-repository",
    });
  });
});

describe("pushLaneBranch", () => {
  it("pushes the branch head to the configured remote and returns GitHub URLs", async () => {
    const repositoryPath = await createRepository();
    const bareRemotePath = await createBareRepository();

    await writeRepositoryFile({
      repositoryPath,
      relativePath: "README.md",
      content: "base\n",
    });
    await commitAll(repositoryPath, "base");

    await runGit(repositoryPath, [
      "remote",
      "add",
      "origin",
      "https://github.com/example/meow-team.git",
    ]);
    await runGit(repositoryPath, ["remote", "set-url", "--push", "origin", bareRemotePath]);

    await runGit(repositoryPath, ["checkout", "-b", "requests/example/a1-proposal-1"]);
    await writeRepositoryFile({
      repositoryPath,
      relativePath: "feature.txt",
      content: "feature work\n",
    });
    await commitAll(repositoryPath, "feature work");

    const commitHash = await getBranchHead({
      repositoryPath,
      branchName: "requests/example/a1-proposal-1",
    });
    const pushedCommit = await pushLaneBranch({
      repositoryPath,
      branchName: "requests/example/a1-proposal-1",
      commitHash,
      pushedAt: "2026-04-11T10:00:00.000Z",
    });

    expect(
      await runGit(bareRemotePath, ["rev-parse", "refs/heads/requests/example/a1-proposal-1"]),
    ).toBe(commitHash);
    expect(pushedCommit).toEqual({
      remoteName: "origin",
      repositoryUrl: "https://github.com/example/meow-team",
      branchUrl: "https://github.com/example/meow-team/tree/requests/example/a1-proposal-1",
      commitUrl: `https://github.com/example/meow-team/commit/${commitHash}`,
      commitHash,
      pushedAt: "2026-04-11T10:00:00.000Z",
    });
  });
});

describe("archiveOpenSpecChangeInWorktree", () => {
  it("moves an active OpenSpec change into the dated archive directory", async () => {
    const worktreePath = await fs.mkdtemp(path.join(os.tmpdir(), "team-git-archive-test-"));
    temporaryDirectories.add(worktreePath);

    const sourceChangePath = path.join(
      worktreePath,
      "openspec",
      "changes",
      "change-name",
      "proposal.md",
    );
    await fs.mkdir(path.dirname(sourceChangePath), { recursive: true });
    await fs.writeFile(sourceChangePath, "proposal\n", "utf8");

    await expect(
      archiveOpenSpecChangeInWorktree({
        worktreePath,
        changeName: "change-name",
        archiveDate: new Date("2026-04-11T10:00:00.000Z"),
      }),
    ).resolves.toEqual({
      archivedPath: "openspec/changes/archive/2026-04-11-change-name",
      createdArchive: true,
    });

    await expect(fs.readFile(sourceChangePath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      fs.readFile(
        path.join(
          worktreePath,
          "openspec",
          "changes",
          "archive",
          "2026-04-11-change-name",
          "proposal.md",
        ),
        "utf8",
      ),
    ).resolves.toBe("proposal\n");
  });

  it("treats an already archived change as idempotent", async () => {
    const worktreePath = await fs.mkdtemp(path.join(os.tmpdir(), "team-git-archive-test-"));
    temporaryDirectories.add(worktreePath);

    const archiveProposalPath = path.join(
      worktreePath,
      "openspec",
      "changes",
      "archive",
      "2026-04-11-change-name",
      "proposal.md",
    );
    await fs.mkdir(path.dirname(archiveProposalPath), { recursive: true });
    await fs.writeFile(archiveProposalPath, "archived\n", "utf8");

    await expect(
      archiveOpenSpecChangeInWorktree({
        worktreePath,
        changeName: "change-name",
        archiveDate: new Date("2026-04-11T10:00:00.000Z"),
      }),
    ).resolves.toEqual({
      archivedPath: "openspec/changes/archive/2026-04-11-change-name",
      createdArchive: false,
    });
  });

  it("reuses an existing archive from an earlier day when finalization is retried later", async () => {
    const worktreePath = await fs.mkdtemp(path.join(os.tmpdir(), "team-git-archive-test-"));
    temporaryDirectories.add(worktreePath);

    const archiveProposalPath = path.join(
      worktreePath,
      "openspec",
      "changes",
      "archive",
      "2026-04-11-change-name",
      "proposal.md",
    );
    await fs.mkdir(path.dirname(archiveProposalPath), { recursive: true });
    await fs.writeFile(archiveProposalPath, "archived\n", "utf8");

    await expect(
      archiveOpenSpecChangeInWorktree({
        worktreePath,
        changeName: "change-name",
        archiveDate: new Date("2026-04-12T10:00:00.000Z"),
      }),
    ).resolves.toEqual({
      archivedPath: "openspec/changes/archive/2026-04-11-change-name",
      createdArchive: false,
    });
  });
});

describe("tryRebaseWorktreeBranch", () => {
  it("rebases the worktree branch onto the base branch when git can apply it cleanly", async () => {
    const repositoryPath = await createRepository();

    await writeRepositoryFile({
      repositoryPath,
      relativePath: "README.md",
      content: "base\n",
    });
    await commitAll(repositoryPath, "base");

    await runGit(repositoryPath, ["checkout", "-b", "feature"]);
    await writeRepositoryFile({
      repositoryPath,
      relativePath: "feature.txt",
      content: "feature work\n",
    });
    await commitAll(repositoryPath, "feature work");
    const featureHeadBefore = await getBranchHead({
      repositoryPath,
      branchName: "feature",
    });

    await runGit(repositoryPath, ["checkout", "main"]);
    await writeRepositoryFile({
      repositoryPath,
      relativePath: "main.txt",
      content: "main work\n",
    });
    await commitAll(repositoryPath, "main work");

    const worktreePath = createWorktreePath();
    await runGit(repositoryPath, ["worktree", "add", worktreePath, "feature"]);

    const result = await tryRebaseWorktreeBranch({
      worktreePath,
      baseBranch: "main",
    });

    const featureHeadAfter = await getBranchHead({
      repositoryPath,
      branchName: "feature",
    });

    expect(result).toEqual({
      applied: true,
      error: null,
    });
    expect(featureHeadAfter).not.toBe(featureHeadBefore);
    expect(await runGit(worktreePath, ["status", "--short"])).toBe("");
    expect(await fs.readFile(path.join(worktreePath, "main.txt"), "utf8")).toBe("main work\n");
    expect(await fs.readFile(path.join(worktreePath, "feature.txt"), "utf8")).toBe(
      "feature work\n",
    );
  });

  it("aborts a failed rebase so the worktree stays reusable", async () => {
    const repositoryPath = await createRepository();

    await writeRepositoryFile({
      repositoryPath,
      relativePath: "conflict.txt",
      content: "base\n",
    });
    await commitAll(repositoryPath, "base");

    await runGit(repositoryPath, ["checkout", "-b", "feature"]);
    await writeRepositoryFile({
      repositoryPath,
      relativePath: "conflict.txt",
      content: "feature\n",
    });
    await commitAll(repositoryPath, "feature change");
    const featureHeadBefore = await getBranchHead({
      repositoryPath,
      branchName: "feature",
    });

    await runGit(repositoryPath, ["checkout", "main"]);
    await writeRepositoryFile({
      repositoryPath,
      relativePath: "conflict.txt",
      content: "main\n",
    });
    await commitAll(repositoryPath, "main change");

    const worktreePath = createWorktreePath();
    await runGit(repositoryPath, ["worktree", "add", worktreePath, "feature"]);

    const firstAttempt = await tryRebaseWorktreeBranch({
      worktreePath,
      baseBranch: "main",
    });
    const secondAttempt = await tryRebaseWorktreeBranch({
      worktreePath,
      baseBranch: "main",
    });
    const featureHeadAfter = await getBranchHead({
      repositoryPath,
      branchName: "feature",
    });

    expect(firstAttempt.applied).toBe(false);
    expect(firstAttempt.error).toContain("could not apply");
    expect(secondAttempt.applied).toBe(false);
    expect(secondAttempt.error).toContain("could not apply");
    expect(featureHeadAfter).toBe(featureHeadBefore);
    expect(await runGit(worktreePath, ["status", "--short"])).toBe("");
    expect(await fs.readFile(path.join(worktreePath, "conflict.txt"), "utf8")).toBe("feature\n");
  });
});
