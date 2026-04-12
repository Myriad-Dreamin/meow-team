import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { buildGitProcessEnv } from "@/lib/git/process";
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

describe("buildGitProcessEnv", () => {
  it("removes relative and node_modules PATH entries before spawning git tools", () => {
    const env = buildGitProcessEnv({
      PATH: [
        "./node_modules/.bin",
        "/tmp/worktree/node_modules/.bin",
        "/custom/bin",
        "/usr/bin",
      ].join(path.delimiter),
    });
    const pathEntries = (env.PATH ?? "").split(path.delimiter);

    expect(pathEntries).not.toContain("./node_modules/.bin");
    expect(pathEntries).not.toContain("/tmp/worktree/node_modules/.bin");
    expect(pathEntries).toContain("/custom/bin");
    expect(pathEntries).toContain("/usr/bin");
  });
});

describe("git subprocess resolution", () => {
  it("ignores a worktree-local git wrapper when PATH starts with ./node_modules/.bin", async () => {
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

    const wrapperPath = path.join(worktreePath, "node_modules", ".bin", "git");
    await mkdir(path.dirname(wrapperPath), { recursive: true });
    await writeFile(wrapperPath, "#!/bin/sh\nprintf 'wrapper-called' >&2\nexit 91\n", "utf8");
    await chmod(wrapperPath, 0o755);

    const originalPath = process.env.PATH ?? "";
    const originalCwd = process.cwd();

    try {
      process.chdir(worktreePath);
      process.env.PATH = `./node_modules/.bin${path.delimiter}${originalPath}`;

      const expectedHead = await runSystemGit(repositoryPath, ["rev-parse", "feature"]);
      await expect(
        getBranchHead({
          repositoryPath: worktreePath,
          branchName: "feature",
        }),
      ).resolves.toBe(expectedHead);
    } finally {
      process.chdir(originalCwd);
      process.env.PATH = originalPath;
    }
  });
});
