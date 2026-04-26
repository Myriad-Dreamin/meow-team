import { spawnSync } from "node:child_process";
import {
  closeSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(THIS_DIR, "..");
const TSX_LOADER_PATH = path.join(PACKAGE_ROOT, "node_modules", "tsx", "dist", "loader.mjs");
const CLI_ENTRY_PATH = path.join(PACKAGE_ROOT, "src", "index.ts");
const tempDirectories: string[] = [];

type CliRunResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly output: string;
};

afterEach(() => {
  while (tempDirectories.length > 0) {
    const nextDirectory = tempDirectories.pop();
    if (nextDirectory) {
      rmSync(nextDirectory, { recursive: true, force: true });
    }
  }
});

function createTempDirectory(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}

function writeFile(filePath: string, content: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function runCli(args: readonly string[], cwd: string): CliRunResult {
  const outputDirectory = createTempDirectory("meow-flow-worktree-output-");
  const stdoutPath = path.join(outputDirectory, "stdout.txt");
  const stderrPath = path.join(outputDirectory, "stderr.txt");
  const stdoutFd = openSync(stdoutPath, "w");
  const stderrFd = openSync(stderrPath, "w");

  const result = spawnSync(
    process.execPath,
    ["--conditions=source", "--import", TSX_LOADER_PATH, CLI_ENTRY_PATH, ...args],
    {
      cwd,
      env: process.env,
      stdio: ["ignore", stdoutFd, stderrFd],
    },
  );

  closeSync(stdoutFd);
  closeSync(stderrFd);

  const stdout = readFileSync(stdoutPath, "utf8");
  const stderr = readFileSync(stderrPath, "utf8");

  return {
    status: result.status,
    stdout,
    stderr,
    output: `${stdout}${stderr}`,
  };
}

function createGitRepository(prefix: string): string {
  const repositoryRoot = createTempDirectory(prefix);

  runGit(["init"], repositoryRoot);
  runGit(["config", "user.email", "test@example.com"], repositoryRoot);
  runGit(["config", "user.name", "Test User"], repositoryRoot);
  writeFile(path.join(repositoryRoot, "README.md"), "# Test repository\n");
  runGit(["add", "README.md"], repositoryRoot);
  runGit(["commit", "-m", "init"], repositoryRoot);

  return repositoryRoot;
}

function readGitWorktreeList(repositoryRoot: string): string {
  return runGit(["worktree", "list", "--porcelain"], repositoryRoot);
}

function runGit(args: readonly string[], cwd: string): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }

  return result.stdout;
}

describe("mfl worktree", () => {
  test("creates, lists, and removes default Paseo worktrees", () => {
    const repositoryRoot = createGitRepository("meow-flow-worktree-repo-");

    const firstCreate = runCli(["worktree", "new", "--branch", "mfl-test-1"], repositoryRoot);
    const secondCreate = runCli(["worktree", "new"], repositoryRoot);
    const listResult = runCli(["worktree", "ls"], repositoryRoot);
    const aliasListResult = runCli(["worktree", "list"], repositoryRoot);
    const removeResult = runCli(["worktree", "rm", "paseo-1"], repositoryRoot);
    const aliasRemoveResult = runCli(["worktree", "remove", "paseo-2"], repositoryRoot);

    expect(firstCreate.status).toBe(0);
    expect(firstCreate.stdout).toContain(".paseo-worktrees/paseo-1 mfl-test-1");
    expect(secondCreate.status).toBe(0);
    expect(secondCreate.stdout).toMatch(/\.paseo-worktrees\/paseo-2 mfl-[0-9a-f]{8}/);
    expect(listResult.status).toBe(0);
    expect(listResult.stdout).toContain(".paseo-worktrees/paseo-1 mfl-test-1");
    expect(listResult.stdout).toContain(".paseo-worktrees/paseo-2 mfl-");
    expect(aliasListResult.stdout).toBe(listResult.stdout);
    expect(removeResult.status).toBe(0);
    expect(removeResult.stdout).toContain(".paseo-worktrees/paseo-1 mfl-test-1 removed");
    expect(aliasRemoveResult.status).toBe(0);

    const gitWorktreeList = readGitWorktreeList(repositoryRoot);
    expect(gitWorktreeList).not.toContain(".paseo-worktrees/paseo-1");
    expect(gitWorktreeList).not.toContain(".paseo-worktrees/paseo-2");
  });

  test("lists worktrees that were created outside mfl", () => {
    const repositoryRoot = createGitRepository("meow-flow-worktree-manual-");
    const worktreePath = path.join(repositoryRoot, "custom", "manual");

    runGit(["worktree", "add", "-b", "manual-branch", worktreePath, "HEAD"], repositoryRoot);

    const result = runCli(["worktree", "ls"], repositoryRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("custom/manual manual-branch");
  });
});
