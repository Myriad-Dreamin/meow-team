import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";

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

function runCli(
  args: readonly string[],
  cwd: string,
  options: { readonly env?: NodeJS.ProcessEnv } = {},
): CliRunResult {
  const outputDirectory = createTempDirectory("meow-flow-skills-output-");
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

describe("mfl install-skills", () => {
  test("installs embedded skills and reference markdown for requested providers", () => {
    const homeDirectory = createTempDirectory("meow-flow-skills-home-");
    const codexHome = path.join(homeDirectory, "codex-home");
    const claudeConfigDir = path.join(homeDirectory, "claude-config");
    const opencodeConfigDir = path.join(homeDirectory, "opencode-config");

    const result = runCli(["install-skills", "codex", "claude", "opencode"], homeDirectory, {
      env: {
        HOME: homeDirectory,
        CODEX_HOME: codexHome,
        CLAUDE_CONFIG_DIR: claudeConfigDir,
        OPENCODE_CONFIG_DIR: opencodeConfigDir,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Installed 6 skills for codex at ${codexHome}/skills`);
    expect(result.stdout).toContain(`Installed 6 skills for claude at ${claudeConfigDir}/skills`);
    expect(result.stdout).toContain(
      `Installed 6 skills for opencode at ${opencodeConfigDir}/skills`,
    );

    expect(readFileSync(path.join(codexHome, "skills", "paseo", "SKILL.md"), "utf8")).toContain(
      "name: paseo",
    );
    expect(
      readFileSync(
        path.join(claudeConfigDir, "skills", "paseo-orchestrate", "references", "preferences.md"),
        "utf8",
      ),
    ).toContain("# Preferences");
    expect(
      readFileSync(path.join(opencodeConfigDir, "skills", "paseo-loop", "SKILL.md"), "utf8"),
    ).toContain("name: paseo-loop");
  });

  test("asks for a provider when none is provided", () => {
    const homeDirectory = createTempDirectory("meow-flow-skills-no-provider-");

    const result = runCli(["install-skills"], homeDirectory, {
      env: {
        HOME: homeDirectory,
      },
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain("Please provide at least one LLM provider");
    expect(result.output).toContain("mfl install-skills codex claude");
    expect(existsSync(path.join(homeDirectory, ".codex", "skills"))).toBe(false);
  });
});
