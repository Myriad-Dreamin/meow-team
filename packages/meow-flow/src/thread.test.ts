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

function runCli(
  args: readonly string[],
  cwd: string,
  options: { readonly env?: NodeJS.ProcessEnv } = {},
): CliRunResult {
  const outputDirectory = createTempDirectory("meow-flow-thread-output-");
  const stdoutPath = path.join(outputDirectory, "stdout.txt");
  const stderrPath = path.join(outputDirectory, "stderr.txt");
  const stdoutFd = openSync(stdoutPath, "w");
  const stderrFd = openSync(stderrPath, "w");

  const result = spawnSync(
    process.execPath,
    ["--import", TSX_LOADER_PATH, CLI_ENTRY_PATH, ...args],
    {
      cwd,
      env: {
        ...process.env,
        ...options.env,
      },
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

function testHomeEnv(homeDirectory: string): NodeJS.ProcessEnv {
  return {
    HOME: homeDirectory,
    USERPROFILE: homeDirectory,
  };
}

function sharedConfigPath(homeDirectory: string): string {
  return path.join(homeDirectory, ".local", "shared", "meow-flow", "config.js");
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

function createPaseoWorktree(repositoryRoot: string, slotNumber: number): string {
  const worktreePath = path.join(repositoryRoot, ".paseo-worktrees", `paseo-${slotNumber}`);

  mkdirSync(path.dirname(worktreePath), { recursive: true });
  runGit(["worktree", "add", "-b", `paseo-${slotNumber}`, worktreePath, "HEAD"], repositoryRoot);

  return worktreePath;
}

function writeTeamConfig(
  configPath: string,
  options: { readonly maxConcurrentWorkers?: number },
): void {
  const dispatch =
    options.maxConcurrentWorkers === undefined
      ? ""
      : `
  dispatch: {
    maxConcurrentWorkers: ${options.maxConcurrentWorkers},
  },
`;

  writeFile(
    configPath,
    `
module.exports = {
${dispatch}  repositories: [
    {
      id: "test-repository",
      directory: ".",
    },
  ],
};
    `.trimStart(),
  );
}

function runGit(args: readonly string[], cwd: string): void {
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
}

describe("meow-flow thread ls", () => {
  test("lists configured slots from inside the primary checkout", () => {
    const repositoryRoot = createGitRepository("meow-flow-thread-primary-");
    const configPath = path.join(repositoryRoot, "team.config.js");
    const nestedDirectory = path.join(repositoryRoot, "packages", "app");

    writeTeamConfig(configPath, { maxConcurrentWorkers: 3 });
    createPaseoWorktree(repositoryRoot, 1);
    mkdirSync(nestedDirectory, { recursive: true });

    const result = runCli(["thread", "ls", "--config", configPath], nestedDirectory);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      [
        ".paseo-worktrees/paseo-1 idle",
        ".paseo-worktrees/paseo-2 not-created (folder is not allocated)",
        ".paseo-worktrees/paseo-3 not-created (folder is not allocated)",
        "",
      ].join("\n"),
    );
  });

  test("resolves the primary checkout root from inside a linked Paseo worktree", () => {
    const repositoryRoot = createGitRepository("meow-flow-thread-linked-");
    const configPath = path.join(repositoryRoot, "team.config.js");
    const worktreePath = createPaseoWorktree(repositoryRoot, 1);
    const nestedWorktreeDirectory = path.join(worktreePath, "nested");

    writeTeamConfig(configPath, { maxConcurrentWorkers: 2 });
    mkdirSync(nestedWorktreeDirectory, { recursive: true });

    const result = runCli(["thread", "ls", "--config", configPath], nestedWorktreeDirectory);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      [
        ".paseo-worktrees/paseo-1 idle",
        ".paseo-worktrees/paseo-2 not-created (folder is not allocated)",
        "",
      ].join("\n"),
    );
  });

  test("uses the installed shared config by default", () => {
    const homeDirectory = createTempDirectory("meow-flow-thread-home-");
    const repositoryRoot = createGitRepository("meow-flow-thread-shared-");

    writeTeamConfig(sharedConfigPath(homeDirectory), { maxConcurrentWorkers: 1 });

    const result = runCli(["thread", "ls"], repositoryRoot, {
      env: testHomeEnv(homeDirectory),
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(".paseo-worktrees/paseo-1 not-created (folder is not allocated)\n");
  });

  test("fails clearly when max concurrent workers is not configured", () => {
    const repositoryRoot = createGitRepository("meow-flow-thread-missing-max-");
    const configPath = path.join(repositoryRoot, "team.config.js");

    writeTeamConfig(configPath, {});

    const result = runCli(["thread", "ls", "--config", configPath], repositoryRoot);

    expect(result.status).toBe(1);
    expect(result.output).toContain("dispatch.maxConcurrentWorkers");
    expect(result.output).toContain("meow-flow thread ls");
  });

  test("fails clearly outside a git repository", () => {
    const workingDirectory = createTempDirectory("meow-flow-thread-outside-git-");
    const configPath = path.join(workingDirectory, "team.config.js");

    writeTeamConfig(configPath, { maxConcurrentWorkers: 1 });

    const result = runCli(["thread", "ls", "--config", configPath], workingDirectory);

    expect(result.status).toBe(1);
    expect(result.output).toContain("must be run inside a git repository");
  });
});
