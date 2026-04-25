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
  const outputDirectory = createTempDirectory("meow-flow-run-output-");
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
  fs.writeSync(2, process.env.PASEO_ERROR_MESSAGE ?? "fake paseo failed");
  fs.writeSync(2, "\\n");
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
      MFL_PASEO_BIN: "paseo",
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

function createManualWorktree(repositoryRoot: string): string {
  const worktreePath = path.join(repositoryRoot, "manual-worktrees", "custom");

  runGit(["worktree", "add", "-b", "manual-worktree", worktreePath, "HEAD"], repositoryRoot);

  return worktreePath;
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

describe("mfl run", () => {
  test("launches paseo in a git-discovered linked worktree without loading config", () => {
    const repositoryRoot = createGitRepository("meow-flow-run-repo-");
    const worktreePath = createManualWorktree(repositoryRoot);
    const fakePaseo = createFakePaseo();
    const requestBody = "Create a echo hello script.";

    const result = runCli(["run", "--id", "fix-test-ci", requestBody], repositoryRoot, {
      env: fakePaseo.env,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Thread: fix-test-ci");
    expect(result.stdout).toContain("Workspace: manual-worktrees/custom");

    const invocations = readPaseoInvocations(fakePaseo.invocationLogPath);

    expect(invocations).toEqual([
      {
        argv: ["run", "--cwd", worktreePath, "--label", "x-meow-flow-id=fix-test-ci", requestBody],
        cwd: repositoryRoot,
      },
    ]);
  });

  test("fails with a worktree creation hint when no linked worktree is available", () => {
    const repositoryRoot = createGitRepository("meow-flow-run-no-worktree-");
    const fakePaseo = createFakePaseo();

    const result = runCli(["run", "--id", "fix-test-ci", "will wait"], repositoryRoot, {
      env: fakePaseo.env,
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain("No git worktree is available");
    expect(result.output).toContain("mfl worktree new");
    expect(readPaseoInvocations(fakePaseo.invocationLogPath)).toHaveLength(0);
  });

  test("reports paseo run failures", () => {
    const repositoryRoot = createGitRepository("meow-flow-run-failure-");
    createManualWorktree(repositoryRoot);
    const fakePaseo = createFakePaseo();

    const result = runCli(["run", "--id", "fix-test-ci", "will fail"], repositoryRoot, {
      env: {
        ...fakePaseo.env,
        PASEO_EXIT_CODE: "7",
        PASEO_ERROR_MESSAGE: "fake paseo failed before creating an agent",
      },
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain("paseo run failed with exit code 7");
    expect(result.output).toContain("fake paseo failed before creating an agent");
  });
});
