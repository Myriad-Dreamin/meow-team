import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
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
import { getSharedMeowFlowDatabasePath } from "./shared-config.js";
import { openThreadOccupationStore } from "./thread-occupation-store.js";

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

type FakePaseo = {
  readonly invocationLogPath: string;
  readonly env: NodeJS.ProcessEnv;
};

type PaseoInvocation = {
  readonly argv: readonly string[];
  readonly cwd: string;
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
  const defaultHomeDirectory = createTempDirectory("meow-flow-thread-default-home-");
  const outputDirectory = createTempDirectory("meow-flow-thread-output-");
  const stdoutPath = path.join(outputDirectory, "stdout.txt");
  const stderrPath = path.join(outputDirectory, "stderr.txt");
  const stdoutFd = openSync(stdoutPath, "w");
  const stderrFd = openSync(stderrPath, "w");

  const result = spawnSync(
    process.execPath,
    ["--conditions=source", "--import", TSX_LOADER_PATH, CLI_ENTRY_PATH, ...args],
    {
      cwd,
      env: {
        ...process.env,
        ...testHomeEnv(defaultHomeDirectory),
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

function createFakePaseo(): FakePaseo {
  const binDirectory = createTempDirectory("meow-flow-fake-paseo-bin-");
  const scriptPath = path.join(binDirectory, "paseo.js");
  const posixBinPath = path.join(binDirectory, "paseo");
  const cmdBinPath = path.join(binDirectory, "paseo.cmd");
  const invocationLogPath = path.join(binDirectory, "paseo-invocations.jsonl");

  writeFile(
    scriptPath,
    `
const fs = require("node:fs");

const logPath = process.env.PASEO_INVOCATION_LOG;

if (logPath) {
  fs.appendFileSync(
    logPath,
    \`\${JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() })}\\n\`,
  );
}

const exitCode = Number.parseInt(process.env.PASEO_EXIT_CODE ?? "0", 10);

if (exitCode !== 0) {
  process.stderr.write(process.env.PASEO_ERROR_MESSAGE ?? "fake paseo failed");
  process.stderr.write("\\n");
  process.exit(exitCode);
}
    `.trimStart(),
  );
  writeFile(
    posixBinPath,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(scriptPath)} "$@"\n`,
  );
  writeFile(cmdBinPath, `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`);
  chmodSync(scriptPath, 0o755);
  chmodSync(posixBinPath, 0o755);

  return {
    invocationLogPath,
    env: {
      PATH: `${binDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
      PASEO_INVOCATION_LOG: invocationLogPath,
    },
  };
}

function readPaseoInvocations(invocationLogPath: string): readonly PaseoInvocation[] {
  if (!existsSync(invocationLogPath)) {
    return [];
  }

  const content = readFileSync(invocationLogPath, "utf8").trim();

  if (content.length === 0) {
    return [];
  }

  return content.split(/\r?\n/).map((line) => JSON.parse(line) as PaseoInvocation);
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

describe("mfl thread ls", () => {
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
    expect(result.output).toContain("mfl thread ls");
  });

  test("fails clearly outside a git repository", () => {
    const workingDirectory = createTempDirectory("meow-flow-thread-outside-git-");
    const configPath = path.join(workingDirectory, "team.config.js");

    writeTeamConfig(configPath, { maxConcurrentWorkers: 1 });

    const result = runCli(["thread", "ls", "--config", configPath], workingDirectory);

    expect(result.status).toBe(1);
    expect(result.output).toContain("must be run inside a git repository");
  });

  test("fails with the git repository diagnostic outside git before requiring shared config", () => {
    const homeDirectory = createTempDirectory("meow-flow-thread-home-no-shared-config-");
    const workingDirectory = createTempDirectory("meow-flow-thread-outside-git-no-config-");

    const result = runCli(["thread", "ls"], workingDirectory, {
      env: testHomeEnv(homeDirectory),
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain("must be run inside a git repository");
    expect(result.output).not.toContain("No shared Meow Flow config is installed");
  });

  test("run with an explicit id allocates the lowest idle registered slot and persists list output", () => {
    const homeDirectory = createTempDirectory("meow-flow-thread-run-home-");
    const repositoryRoot = createGitRepository("meow-flow-thread-run-explicit-");
    const configPath = path.join(repositoryRoot, "team.config.js");
    const firstWorktreePath = createPaseoWorktree(repositoryRoot, 1);
    const secondWorktreePath = createPaseoWorktree(repositoryRoot, 2);
    const fakePaseo = createFakePaseo();
    const env = {
      ...testHomeEnv(homeDirectory),
      ...fakePaseo.env,
    };
    const requestBody = 'echo "hello world"';

    writeTeamConfig(configPath, { maxConcurrentWorkers: 3 });

    const firstRun = runCli(
      ["run", "--id", "existing-thread", "--config", configPath, "first request"],
      repositoryRoot,
      { env },
    );
    const secondRun = runCli(
      ["run", "--id", "fix-test-ci", "--config", configPath, requestBody],
      repositoryRoot,
      { env },
    );

    expect(firstRun.status).toBe(0);
    expect(firstRun.stdout).toContain("Workspace: .paseo-worktrees/paseo-1");
    expect(secondRun.status).toBe(0);
    expect(secondRun.stdout).toContain("Thread: fix-test-ci");
    expect(secondRun.stdout).toContain("Workspace: .paseo-worktrees/paseo-2");

    const invocations = readPaseoInvocations(fakePaseo.invocationLogPath);

    expect(invocations).toHaveLength(2);
    expect(invocations[0]?.argv).toEqual([
      "run",
      "--cwd",
      firstWorktreePath,
      "--label",
      "x-meow-flow-id=existing-thread",
      "first request",
    ]);
    expect(invocations[1]?.argv).toEqual([
      "run",
      "--cwd",
      secondWorktreePath,
      "--label",
      "x-meow-flow-id=fix-test-ci",
      requestBody,
    ]);

    const store = openThreadOccupationStore({ homeDirectory });

    try {
      expect(store.readOccupationByThreadId("fix-test-ci")?.requestBody).toBe(requestBody);
    } finally {
      store.close();
    }

    const listResult = runCli(["thread", "ls", "--config", configPath], repositoryRoot, { env });

    expect(listResult.status).toBe(0);
    expect(listResult.stdout).toBe(
      [
        ".paseo-worktrees/paseo-1 existing-thread",
        ".paseo-worktrees/paseo-2 fix-test-ci",
        ".paseo-worktrees/paseo-3 not-created (folder is not allocated)",
        "",
      ].join("\n"),
    );
  });

  test("run without an id generates a UUID and stores it in the Paseo label", () => {
    const homeDirectory = createTempDirectory("meow-flow-thread-run-generated-home-");
    const repositoryRoot = createGitRepository("meow-flow-thread-run-generated-");
    const configPath = path.join(repositoryRoot, "team.config.js");
    const worktreePath = createPaseoWorktree(repositoryRoot, 1);
    const fakePaseo = createFakePaseo();
    const env = {
      ...testHomeEnv(homeDirectory),
      ...fakePaseo.env,
    };

    writeTeamConfig(configPath, { maxConcurrentWorkers: 1 });

    const result = runCli(["run", "--config", configPath, "generated request"], repositoryRoot, {
      env,
    });
    const threadId = result.stdout.match(/^Thread: ([0-9a-f-]{36})$/im)?.[1];

    expect(result.status).toBe(0);
    expect(threadId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.stdout).toContain("Workspace: .paseo-worktrees/paseo-1");
    expect(existsSync(getSharedMeowFlowDatabasePath(homeDirectory))).toBe(true);

    const invocations = readPaseoInvocations(fakePaseo.invocationLogPath);

    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.argv).toEqual([
      "run",
      "--cwd",
      worktreePath,
      "--label",
      `x-meow-flow-id=${threadId}`,
      "generated request",
    ]);
  });

  test("run skips not-created slots when selecting an idle workspace", () => {
    const homeDirectory = createTempDirectory("meow-flow-thread-run-skip-home-");
    const repositoryRoot = createGitRepository("meow-flow-thread-run-skip-");
    const configPath = path.join(repositoryRoot, "team.config.js");
    const fakePaseo = createFakePaseo();
    const env = {
      ...testHomeEnv(homeDirectory),
      ...fakePaseo.env,
    };

    writeTeamConfig(configPath, { maxConcurrentWorkers: 3 });
    createPaseoWorktree(repositoryRoot, 1);
    createPaseoWorktree(repositoryRoot, 3);

    expect(
      runCli(["run", "--id", "busy-thread", "--config", configPath, "busy"], repositoryRoot, {
        env,
      }).status,
    ).toBe(0);

    const result = runCli(
      ["run", "--id", "fix-test-ci", "--config", configPath, 'echo "hello world"'],
      repositoryRoot,
      { env },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Workspace: .paseo-worktrees/paseo-3");
  });

  test("run rejects existing thread ids without launching a duplicate Paseo agent", () => {
    const homeDirectory = createTempDirectory("meow-flow-thread-run-existing-home-");
    const repositoryRoot = createGitRepository("meow-flow-thread-run-existing-");
    const configPath = path.join(repositoryRoot, "team.config.js");
    const fakePaseo = createFakePaseo();
    const env = {
      ...testHomeEnv(homeDirectory),
      ...fakePaseo.env,
    };

    writeTeamConfig(configPath, { maxConcurrentWorkers: 1 });
    createPaseoWorktree(repositoryRoot, 1);

    expect(
      runCli(["run", "--id", "fix-test-ci", "--config", configPath, "first"], repositoryRoot, {
        env,
      }).status,
    ).toBe(0);

    const result = runCli(
      ["run", "--id", "fix-test-ci", "--config", configPath, "second"],
      repositoryRoot,
      { env },
    );

    expect(result.status).toBe(1);
    expect(result.output).toContain("Thread id fix-test-ci is already running");
    expect(result.output).toContain(".paseo-worktrees/paseo-1");
    expect(readPaseoInvocations(fakePaseo.invocationLogPath)).toHaveLength(1);
  });

  test("run rejects a thread id already allocated in another repository", () => {
    const homeDirectory = createTempDirectory("meow-flow-thread-run-other-repo-home-");
    const firstRepositoryRoot = createGitRepository("meow-flow-thread-run-repo-a-");
    const secondRepositoryRoot = createGitRepository("meow-flow-thread-run-repo-b-");
    const firstConfigPath = path.join(firstRepositoryRoot, "team.config.js");
    const secondConfigPath = path.join(secondRepositoryRoot, "team.config.js");
    const fakePaseo = createFakePaseo();
    const env = {
      ...testHomeEnv(homeDirectory),
      ...fakePaseo.env,
    };

    writeTeamConfig(firstConfigPath, { maxConcurrentWorkers: 1 });
    writeTeamConfig(secondConfigPath, { maxConcurrentWorkers: 1 });
    createPaseoWorktree(firstRepositoryRoot, 1);
    createPaseoWorktree(secondRepositoryRoot, 1);

    expect(
      runCli(
        ["run", "--id", "fix-test-ci", "--config", firstConfigPath, "first"],
        firstRepositoryRoot,
        { env },
      ).status,
    ).toBe(0);

    const result = runCli(
      ["run", "--id", "fix-test-ci", "--config", secondConfigPath, "second"],
      secondRepositoryRoot,
      { env },
    );

    expect(result.status).toBe(1);
    expect(result.output).toContain("Thread id fix-test-ci is already running");
    expect(result.output).toContain(firstRepositoryRoot);
    expect(readPaseoInvocations(fakePaseo.invocationLogPath)).toHaveLength(1);
  });

  test("run fails clearly when no idle registered workspace is available", () => {
    const homeDirectory = createTempDirectory("meow-flow-thread-run-no-idle-home-");
    const repositoryRoot = createGitRepository("meow-flow-thread-run-no-idle-");
    const configPath = path.join(repositoryRoot, "team.config.js");
    const fakePaseo = createFakePaseo();
    const env = {
      ...testHomeEnv(homeDirectory),
      ...fakePaseo.env,
    };

    writeTeamConfig(configPath, { maxConcurrentWorkers: 1 });

    const result = runCli(
      ["run", "--id", "fix-test-ci", "--config", configPath, "no idle"],
      repositoryRoot,
      { env },
    );
    const listResult = runCli(["thread", "ls", "--config", configPath], repositoryRoot, { env });

    expect(result.status).toBe(1);
    expect(result.output).toContain("No idle thread workspace is available");
    expect(readPaseoInvocations(fakePaseo.invocationLogPath)).toHaveLength(0);
    expect(listResult.stdout).toBe(
      ".paseo-worktrees/paseo-1 not-created (folder is not allocated)\n",
    );
  });

  test("run releases a fresh occupation when paseo run fails", () => {
    const homeDirectory = createTempDirectory("meow-flow-thread-run-rollback-home-");
    const repositoryRoot = createGitRepository("meow-flow-thread-run-rollback-");
    const configPath = path.join(repositoryRoot, "team.config.js");
    const fakePaseo = createFakePaseo();
    const env = {
      ...testHomeEnv(homeDirectory),
      ...fakePaseo.env,
      PASEO_EXIT_CODE: "7",
      PASEO_ERROR_MESSAGE: "fake paseo failed before creating an agent",
    };

    writeTeamConfig(configPath, { maxConcurrentWorkers: 1 });
    createPaseoWorktree(repositoryRoot, 1);

    const result = runCli(
      ["run", "--id", "fix-test-ci", "--config", configPath, "will fail"],
      repositoryRoot,
      { env },
    );
    const listResult = runCli(["thread", "ls", "--config", configPath], repositoryRoot, { env });
    const store = openThreadOccupationStore({ homeDirectory });

    try {
      expect(store.readOccupationByThreadId("fix-test-ci")).toBeNull();
    } finally {
      store.close();
    }

    expect(result.status).toBe(1);
    expect(result.output).toContain("paseo run failed");
    expect(readPaseoInvocations(fakePaseo.invocationLogPath)).toHaveLength(1);
    expect(listResult.stdout).toBe(".paseo-worktrees/paseo-1 idle\n");
  });

  test("delete releases a single occupation from outside a git repository", () => {
    const homeDirectory = createTempDirectory("meow-flow-thread-delete-home-");
    const repositoryRoot = createGitRepository("meow-flow-thread-delete-single-");
    const outsideGitDirectory = createTempDirectory("meow-flow-thread-delete-outside-");
    const configPath = path.join(repositoryRoot, "team.config.js");
    const fakePaseo = createFakePaseo();
    const env = {
      ...testHomeEnv(homeDirectory),
      ...fakePaseo.env,
    };

    writeTeamConfig(configPath, { maxConcurrentWorkers: 1 });
    createPaseoWorktree(repositoryRoot, 1);

    expect(
      runCli(["run", "--id", "fix-test-ci", "--config", configPath, "first"], repositoryRoot, {
        env,
      }).status,
    ).toBe(0);

    const deleteResult = runCli(["delete", "fix-test-ci"], outsideGitDirectory, { env });
    const listResult = runCli(["thread", "ls", "--config", configPath], repositoryRoot, { env });

    expect(deleteResult.status).toBe(0);
    expect(deleteResult.stdout).toContain("fix-test-ci released .paseo-worktrees/paseo-1");
    expect(listResult.stdout).toBe(".paseo-worktrees/paseo-1 idle\n");
  });

  test("delete validates all requested ids before deleting any occupations", () => {
    const homeDirectory = createTempDirectory("meow-flow-thread-delete-batch-home-");
    const repositoryRoot = createGitRepository("meow-flow-thread-delete-batch-");
    const configPath = path.join(repositoryRoot, "team.config.js");
    const fakePaseo = createFakePaseo();
    const env = {
      ...testHomeEnv(homeDirectory),
      ...fakePaseo.env,
    };

    writeTeamConfig(configPath, { maxConcurrentWorkers: 2 });
    createPaseoWorktree(repositoryRoot, 1);
    createPaseoWorktree(repositoryRoot, 2);

    expect(
      runCli(["run", "--id", "fix-test-ci", "--config", configPath, "first"], repositoryRoot, {
        env,
      }).status,
    ).toBe(0);
    expect(
      runCli(["run", "--id", "add-feature", "--config", configPath, "second"], repositoryRoot, {
        env,
      }).status,
    ).toBe(0);

    const missingResult = runCli(["delete", "fix-test-ci", "missing-thread"], repositoryRoot, {
      env,
    });
    const afterMissingList = runCli(["thread", "ls", "--config", configPath], repositoryRoot, {
      env,
    });
    const deleteResult = runCli(["delete", "fix-test-ci", "add-feature"], repositoryRoot, {
      env,
    });
    const afterDeleteList = runCli(["thread", "ls", "--config", configPath], repositoryRoot, {
      env,
    });

    expect(missingResult.status).toBe(1);
    expect(missingResult.output).toContain("missing-thread");
    expect(afterMissingList.stdout).toBe(
      [".paseo-worktrees/paseo-1 fix-test-ci", ".paseo-worktrees/paseo-2 add-feature", ""].join(
        "\n",
      ),
    );
    expect(deleteResult.status).toBe(0);
    expect(deleteResult.stdout).toContain("fix-test-ci released .paseo-worktrees/paseo-1");
    expect(deleteResult.stdout).toContain("add-feature released .paseo-worktrees/paseo-2");
    expect(afterDeleteList.stdout).toBe(
      [".paseo-worktrees/paseo-1 idle", ".paseo-worktrees/paseo-2 idle", ""].join("\n"),
    );
  });

  test("top-level ls aliases thread ls with the same options and output", () => {
    const homeDirectory = createTempDirectory("meow-flow-thread-ls-alias-home-");
    const repositoryRoot = createGitRepository("meow-flow-thread-ls-alias-");
    const configPath = path.join(repositoryRoot, "team.config.js");
    const fakePaseo = createFakePaseo();
    const env = {
      ...testHomeEnv(homeDirectory),
      ...fakePaseo.env,
    };

    writeTeamConfig(configPath, { maxConcurrentWorkers: 1 });
    createPaseoWorktree(repositoryRoot, 1);

    expect(
      runCli(["run", "--id", "fix-test-ci", "--config", configPath, "first"], repositoryRoot, {
        env,
      }).status,
    ).toBe(0);

    const threadListResult = runCli(["thread", "ls", "--config", configPath], repositoryRoot, {
      env,
    });
    const aliasListResult = runCli(["ls", "--config", configPath], repositoryRoot, { env });

    expect(threadListResult.status).toBe(0);
    expect(aliasListResult.status).toBe(0);
    expect(aliasListResult.stdout).toBe(threadListResult.stdout);
  });

  test("stale occupations for unregistered worktrees are reported as not-created", () => {
    const homeDirectory = createTempDirectory("meow-flow-thread-stale-home-");
    const repositoryRoot = createGitRepository("meow-flow-thread-stale-");
    const configPath = path.join(repositoryRoot, "team.config.js");
    const worktreePath = createPaseoWorktree(repositoryRoot, 3);
    const fakePaseo = createFakePaseo();
    const env = {
      ...testHomeEnv(homeDirectory),
      ...fakePaseo.env,
    };

    writeTeamConfig(configPath, { maxConcurrentWorkers: 3 });

    expect(
      runCli(["run", "--id", "stale-thread", "--config", configPath, "stale"], repositoryRoot, {
        env,
      }).status,
    ).toBe(0);

    runGit(["worktree", "remove", worktreePath], repositoryRoot);

    const result = runCli(["thread", "ls", "--config", configPath], repositoryRoot, { env });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      [
        ".paseo-worktrees/paseo-1 not-created (folder is not allocated)",
        ".paseo-worktrees/paseo-2 not-created (folder is not allocated)",
        ".paseo-worktrees/paseo-3 not-created (folder is not allocated)",
        "",
      ].join("\n"),
    );
    expect(result.stdout).not.toContain("stale-thread");
  });
});
