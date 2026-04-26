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
  const counterPath = path.join(binDirectory, "paseo-counter.txt");

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

function readOption(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1] ?? null;
}

function nextAgentId() {
  const counterPath = process.env.PASEO_COUNTER_PATH;
  if (!counterPath) {
    return process.env.PASEO_FAKE_AGENT_ID ?? "123456";
  }

  const previous = fs.existsSync(counterPath)
    ? Number.parseInt(fs.readFileSync(counterPath, "utf8"), 10)
    : 0;
  const next = Number.isFinite(previous) ? previous + 1 : 1;
  fs.writeFileSync(counterPath, String(next));
  return process.env.PASEO_FAKE_AGENT_ID ?? String(123455 + next);
}

const argv = process.argv.slice(2);

if (argv[0] === "run") {
  if (process.env.PASEO_MALFORMED_OUTPUT === "1") {
    fs.writeSync(1, "created agent without a parseable id\\n");
    process.exit(0);
  }

  const agentId = nextAgentId();
  const cwd = readOption(argv, "--cwd") ?? process.cwd();
  const title = readOption(argv, "--title");
  fs.writeSync(
    1,
    JSON.stringify({
      agentId,
      status: "running",
      provider: "fake",
      cwd,
      title,
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
      MFL_CONFIG_PATH: path.join(binDirectory, "missing-meow-flow-config.json"),
      MFL_STATE_DB_PATH: path.join(binDirectory, "meow-flow.sqlite"),
      PASEO_COUNTER_PATH: counterPath,
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
  test("launches the initial plan stage in a git-discovered linked worktree with the default provider", () => {
    const repositoryRoot = createGitRepository("meow-flow-run-repo-");
    const worktreePath = createManualWorktree(repositoryRoot);
    const fakePaseo = createFakePaseo();
    const requestBody = "Create a echo hello script.";

    const result = runCli(["run", "--id", "fix-test-ci", requestBody], repositoryRoot, {
      env: fakePaseo.env,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("thread-id: fix-test-ci");
    expect(result.stdout).toContain("worktree: manual-worktrees/custom");
    expect(result.stdout).toContain("stage: plan");
    expect(result.stdout).toContain("provider: claude");
    expect(result.stdout).toContain("agent-id: 123456");
    expect(result.stdout).toContain("next-seq: 1");

    const invocations = readPaseoInvocations(fakePaseo.invocationLogPath);

    expect(invocations).toEqual([
      {
        argv: [
          "run",
          "--json",
          "--detach",
          "--cwd",
          worktreePath,
          "--provider",
          "claude",
          "--label",
          "x-meow-flow-id=fix-test-ci",
          "--label",
          "x-meow-flow-stage=plan",
          "--title",
          "fix-test-ci plan",
          `/meow-plan ${requestBody}`,
        ],
        cwd: repositoryRoot,
      },
    ]);
  });

  test("passes an explicit provider through to paseo run", () => {
    const repositoryRoot = createGitRepository("meow-flow-run-provider-explicit-");
    createManualWorktree(repositoryRoot);
    const fakePaseo = createFakePaseo();
    const configPath = path.join(createTempDirectory("meow-flow-provider-config-"), "config.json");
    writeFile(configPath, JSON.stringify({ provider: "opencode" }));

    const result = runCli(
      ["run", "--provider", "codex/gpt-5.4", "--id", "fix-test-ci", "use codex"],
      repositoryRoot,
      {
        env: {
          ...fakePaseo.env,
          MFL_CONFIG_PATH: configPath,
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("provider: codex/gpt-5.4");

    const invocation = readPaseoInvocations(fakePaseo.invocationLogPath).at(0);
    expect(invocation?.argv).toContain("--provider");
    expect(invocation?.argv).toContain("codex/gpt-5.4");
  });

  test("uses the configured provider when no provider flag is passed", () => {
    const repositoryRoot = createGitRepository("meow-flow-run-provider-configured-");
    createManualWorktree(repositoryRoot);
    const fakePaseo = createFakePaseo();
    const configPath = path.join(createTempDirectory("meow-flow-provider-config-"), "config.json");
    writeFile(configPath, JSON.stringify({ provider: "opencode" }));

    const result = runCli(["run", "--id", "fix-test-ci", "use config"], repositoryRoot, {
      env: {
        ...fakePaseo.env,
        MFL_CONFIG_PATH: configPath,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("provider: opencode");

    const invocation = readPaseoInvocations(fakePaseo.invocationLogPath).at(0);
    expect(invocation?.argv).toContain("--provider");
    expect(invocation?.argv).toContain("opencode");
  });

  test("config set provider creates the run provider config", () => {
    const repositoryRoot = createGitRepository("meow-flow-config-provider-create-");
    const configPath = path.join(createTempDirectory("meow-flow-provider-config-"), "config.json");

    const result = runCli(["config", "set", "provider", "codex/gpt-5.4"], repositoryRoot, {
      env: {
        MFL_CONFIG_PATH: configPath,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("provider: codex/gpt-5.4");
    expect(result.stdout).toContain(`config: ${configPath}`);
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({
      provider: "codex/gpt-5.4",
    });
  });

  test("config set provider preserves unrelated config fields", () => {
    const repositoryRoot = createGitRepository("meow-flow-config-provider-preserve-");
    const configPath = path.join(createTempDirectory("meow-flow-provider-config-"), "config.json");
    writeFile(configPath, JSON.stringify({ provider: "claude", extra: true }));

    const result = runCli(["config", "set", "provider", "opencode"], repositoryRoot, {
      env: {
        MFL_CONFIG_PATH: configPath,
      },
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({
      provider: "opencode",
      extra: true,
    });
  });

  test("config set provider rejects empty provider values", () => {
    const repositoryRoot = createGitRepository("meow-flow-config-provider-empty-");
    const configPath = path.join(createTempDirectory("meow-flow-provider-config-"), "config.json");

    const result = runCli(["config", "set", "provider", "   "], repositoryRoot, {
      env: {
        MFL_CONFIG_PATH: configPath,
      },
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain("provider must be a non-empty string");
    expect(result.output).toContain("paseo provider ls");
    expect(existsSync(configPath)).toBe(false);
  });

  test("rejects invalid provider config before mutating occupations or invoking paseo", () => {
    const repositoryRoot = createGitRepository("meow-flow-run-provider-invalid-config-");
    const worktreePath = createManualWorktree(repositoryRoot);
    const fakePaseo = createFakePaseo();
    const configPath = path.join(createTempDirectory("meow-flow-provider-config-"), "config.json");
    writeFile(configPath, JSON.stringify({ provider: "  " }));

    const result = runCli(["run", "--id", "fix-test-ci", "invalid config"], repositoryRoot, {
      env: {
        ...fakePaseo.env,
        MFL_CONFIG_PATH: configPath,
      },
    });
    const status = runCli(["status"], worktreePath, {
      env: {
        ...fakePaseo.env,
        MFL_CONFIG_PATH: configPath,
      },
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain(`Invalid MeowFlow config at ${configPath}`);
    expect(result.output).toContain("provider must be a non-empty string");
    expect(result.output).toContain("paseo provider ls");
    expect(readPaseoInvocations(fakePaseo.invocationLogPath)).toHaveLength(0);
    expect(status.status).toBe(0);
    expect(status.stdout).toContain("status: idle");
  });

  test("rejects unsupported stages without invoking paseo", () => {
    const repositoryRoot = createGitRepository("meow-flow-run-no-worktree-");
    const fakePaseo = createFakePaseo();

    const result = runCli(
      ["run", "--id", "fix-test-ci", "--stage", "deploy", "will wait"],
      repositoryRoot,
      {
        env: fakePaseo.env,
      },
    );

    expect(result.status).toBe(1);
    expect(result.output).toContain("Stage must be one of plan, code, review, execute, validate");
    expect(readPaseoInvocations(fakePaseo.invocationLogPath)).toHaveLength(0);
  });

  test("fails with a worktree creation hint when no linked worktree is available", () => {
    const repositoryRoot = createGitRepository("meow-flow-run-no-worktree-");
    const fakePaseo = createFakePaseo();

    const result = runCli(["run", "--id", "fix-test-ci", "will wait"], repositoryRoot, {
      env: fakePaseo.env,
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain("No idle thread worktree is available");
    expect(result.output).toContain("mfl worktree new");
    expect(readPaseoInvocations(fakePaseo.invocationLogPath)).toHaveLength(0);
  });

  test("requires an explicit stage after a thread already has agents", () => {
    const repositoryRoot = createGitRepository("meow-flow-run-stage-required-");
    const worktreePath = createManualWorktree(repositoryRoot);
    const fakePaseo = createFakePaseo();

    const firstRun = runCli(["run", "--id", "fix-test-ci", "initial plan"], repositoryRoot, {
      env: fakePaseo.env,
    });
    const secondRun = runCli(["run", "continue without a stage"], worktreePath, {
      env: fakePaseo.env,
    });

    expect(firstRun.status).toBe(0);
    expect(secondRun.status).toBe(1);
    expect(secondRun.output).toContain("--stage is required after a thread already has agents");

    const invocations = readPaseoInvocations(fakePaseo.invocationLogPath);
    expect(invocations).toHaveLength(1);
  });

  test("allows same-thread stage launch from the occupied worktree", () => {
    const repositoryRoot = createGitRepository("meow-flow-run-same-thread-");
    const worktreePath = createManualWorktree(repositoryRoot);
    const fakePaseo = createFakePaseo();

    const firstRun = runCli(["run", "--id", "fix-test-ci", "initial plan"], repositoryRoot, {
      env: fakePaseo.env,
    });
    const secondRun = runCli(
      ["run", "--stage", "code", "implement the approved plan"],
      worktreePath,
      {
        env: fakePaseo.env,
      },
    );

    expect(firstRun.status).toBe(0);
    expect(secondRun.status).toBe(0);
    expect(secondRun.stdout).toContain("agent-id: 123457");
    expect(secondRun.stdout).toContain("next-seq: 1");

    const invocations = readPaseoInvocations(fakePaseo.invocationLogPath);
    expect(invocations.at(-1)).toEqual({
      argv: [
        "run",
        "--json",
        "--detach",
        "--cwd",
        worktreePath,
        "--provider",
        "claude",
        "--label",
        "x-meow-flow-id=fix-test-ci",
        "--label",
        "x-meow-flow-stage=code",
        "--title",
        "fix-test-ci code",
        "/meow-code implement the approved plan",
      ],
      cwd: worktreePath,
    });
  });

  test("reports the occupying thread and latest agent when no idle worktree is available", () => {
    const repositoryRoot = createGitRepository("meow-flow-run-occupied-");
    createManualWorktree(repositoryRoot);
    const fakePaseo = createFakePaseo();

    const firstRun = runCli(["run", "--id", "fix-test-ci", "initial plan"], repositoryRoot, {
      env: fakePaseo.env,
    });
    const secondRun = runCli(["run", "--id", "add-feature", "new thread"], repositoryRoot, {
      env: fakePaseo.env,
    });

    expect(firstRun.status).toBe(0);
    expect(secondRun.status).toBe(1);
    expect(secondRun.output).toContain("No idle thread worktree is available");
    expect(secondRun.output).toContain("thread fix-test-ci agent 123456");
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

    const retry = runCli(["run", "--id", "fix-test-ci", "will succeed"], repositoryRoot, {
      env: fakePaseo.env,
    });
    expect(retry.status).toBe(0);
  });

  test("reports malformed paseo output before recording an agent", () => {
    const repositoryRoot = createGitRepository("meow-flow-run-malformed-");
    createManualWorktree(repositoryRoot);
    const fakePaseo = createFakePaseo();

    const result = runCli(["run", "--id", "fix-test-ci", "will be malformed"], repositoryRoot, {
      env: {
        ...fakePaseo.env,
        PASEO_MALFORMED_OUTPUT: "1",
      },
    });
    const status = runCli(["thread", "status", "fix-test-ci", "--no-color"], repositoryRoot, {
      env: fakePaseo.env,
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain("created agent id could not be determined");
    expect(status.status).toBe(0);
    expect(status.stdout).toContain("agents: []");
  });
});
