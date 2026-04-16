import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { getBranchHead } from "@/lib/git/ops";

const execFileAsync = promisify(execFile);

const runSystemGit = async (repositoryPath: string, args: string[]): Promise<string> => {
  const result = await execFileAsync("/usr/bin/git", ["-C", repositoryPath, ...args], {
    maxBuffer: 1024 * 1024 * 4,
  });

  return result.stdout.trim();
};

const temporaryDirectories = new Set<string>();

afterEach(async () => {
  for (const directory of temporaryDirectories) {
    await rm(directory, {
      force: true,
      recursive: true,
    });
  }

  temporaryDirectories.clear();
});

describe("git subprocess resolution", () => {
  it("resolves branch heads from a linked worktree", async () => {
    const repositoryPath = await mkdtemp(path.join(os.tmpdir(), "git-ops-repo-"));
    temporaryDirectories.add(repositoryPath);

    await runSystemGit(repositoryPath, ["init", "-b", "main"]);
    await runSystemGit(repositoryPath, ["config", "user.name", "Test User"]);
    await runSystemGit(repositoryPath, ["config", "user.email", "test@example.com"]);
    await writeFile(path.join(repositoryPath, "README.md"), "base\n", "utf8");
    await runSystemGit(repositoryPath, ["add", "README.md"]);
    await runSystemGit(repositoryPath, ["commit", "-m", "base"]);
    await runSystemGit(repositoryPath, ["checkout", "-b", "feature"]);
    await runSystemGit(repositoryPath, ["checkout", "main"]);

    const worktreePath = path.join(repositoryPath, "worktrees", "feature");
    await runSystemGit(repositoryPath, ["worktree", "add", worktreePath, "feature"]);

    const expectedHead = await runSystemGit(repositoryPath, ["rev-parse", "feature"]);
    await expect(
      getBranchHead({
        repositoryPath: worktreePath,
        branchName: "feature",
      }),
    ).resolves.toBe(expectedHead);
  });
});
