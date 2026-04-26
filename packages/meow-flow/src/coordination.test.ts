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
  const outputDirectory = createTempDirectory("meow-flow-coordination-output-");
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
const argv = process.argv.slice(2);

if (logPath) {
  fs.appendFileSync(
    logPath,
    \`\${JSON.stringify({ argv, cwd: process.cwd() })}\\n\`,
  );
}

function readOption(name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1] ?? null;
}

if (argv[0] === "run") {
  fs.writeSync(
    1,
    JSON.stringify({
      agentId: "123456",
      status: "running",
      provider: "fake",
      cwd: readOption("--cwd") ?? process.cwd(),
      title: readOption("--title"),
    }) + "\\n",
  );
}

if (argv[0] === "agent" && argv[1] === "update") {
  fs.writeSync(1, JSON.stringify({ agentId: argv[2] ?? "unknown", labels: "" }) + "\\n");
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

describe("mfl coordination commands", () => {
  test("reports repository-root, idle worktree, and occupied worktree status", () => {
    const repositoryRoot = createGitRepository("meow-flow-status-");
    const worktreePath = createManualWorktree(repositoryRoot);
    const fakePaseo = createFakePaseo();

    const rootStatus = runCli(["status"], repositoryRoot);
    const idleStatus = runCli(["status"], worktreePath);
    const runResult = runCli(["run", "--id", "fix-test-ci", "initial request"], repositoryRoot, {
      env: fakePaseo.env,
    });
    const occupiedStatus = runCli(["status"], worktreePath);

    expect(rootStatus.status).toBe(0);
    expect(rootStatus.stdout).toContain("status: repository-root");
    expect(rootStatus.stdout).toContain("mfl worktree new");
    expect(idleStatus.status).toBe(0);
    expect(idleStatus.stdout).toContain("status: idle");
    expect(runResult.status).toBe(0);
    expect(occupiedStatus.status).toBe(0);
    expect(occupiedStatus.stdout).toContain("status: occupied");
    expect(occupiedStatus.stdout).toContain("thread-id: fix-test-ci");
    expect(occupiedStatus.stdout).toContain("agent-id: 123456");
  });

  test("updates thread name, records handoffs, renders status, and archives", () => {
    const repositoryRoot = createGitRepository("meow-flow-thread-");
    const worktreePath = createManualWorktree(repositoryRoot);
    const fakePaseo = createFakePaseo();

    const runResult = runCli(
      ["run", "--id", "fix-test-ci", "the content of request"],
      repositoryRoot,
      {
        env: fakePaseo.env,
      },
    );
    const setName = runCli(["thread", "set", "name", "install-meow-flow-skills"], worktreePath);
    const append = runCli(["handoff", "append", "--stage", "code", "code diff"], worktreePath);
    const getLast = runCli(["handoff", "get", "-n", "1"], worktreePath);
    const getSince = runCli(["handoff", "get", "--since", "1"], worktreePath);
    const status = runCli(["thread", "status", "fix-test-ci", "--no-color"], repositoryRoot);
    const archive = runCli(["thread", "archive"], worktreePath);
    const idleStatus = runCli(["status"], worktreePath);
    const archivedStatus = runCli(
      ["thread", "status", "fix-test-ci", "--no-color"],
      repositoryRoot,
    );

    expect(runResult.status).toBe(0);
    expect(setName.status).toBe(0);
    expect(setName.stdout).toContain("name: install-meow-flow-skills");
    expect(append.status).toBe(0);
    expect(append.stdout).toContain("seq: 1");
    expect(getLast.stdout).toContain("seq: 1");
    expect(getSince.stdout).toContain("seq: 1");
    expect(status.stdout).toContain("name: install-meow-flow-skills");
    expect(status.stdout).toContain("request-body: |");
    expect(status.stdout).toContain("  the content of request");
    expect(status.stdout).toContain("content: |");
    expect(status.stdout).toContain("      code diff");
    expect(archive.status).toBe(0);
    expect(idleStatus.stdout).toContain("status: idle");
    expect(archivedStatus.stdout).toContain("archived: true");
  });

  test("agent update-self persists current agent metadata and updates paseo labels", () => {
    const repositoryRoot = createGitRepository("meow-flow-agent-");
    const worktreePath = createManualWorktree(repositoryRoot);
    const fakePaseo = createFakePaseo();

    const runResult = runCli(["run", "--id", "fix-test-ci", "initial request"], repositoryRoot, {
      env: fakePaseo.env,
    });
    const updateSelf = runCli(["agent", "update-self"], worktreePath, {
      env: {
        ...fakePaseo.env,
        PASEO_AGENT_ID: "self-agent-1",
        MFL_AGENT_SKILL: "meow-plan",
        MFL_AGENT_TITLE: "plan agent",
      },
    });
    const status = runCli(["thread", "status", "fix-test-ci", "--no-color"], repositoryRoot);

    expect(runResult.status).toBe(0);
    expect(updateSelf.status).toBe(0);
    expect(updateSelf.stdout).toContain("agent-id: self-agent-1");
    expect(updateSelf.stdout).toContain("skill: meow-plan");
    expect(status.stdout).toContain("id: self-agent-1");
    expect(status.stdout).toContain('title: "plan agent"');

    const invocations = readPaseoInvocations(fakePaseo.invocationLogPath);
    expect(invocations.at(-1)?.argv).toEqual([
      "agent",
      "update",
      "self-agent-1",
      "--label",
      "x-meow-flow-id=fix-test-ci",
      "--label",
      "x-meow-flow-skill=meow-plan",
      "--json",
    ]);
  });
});
