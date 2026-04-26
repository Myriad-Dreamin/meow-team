import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { EMBEDDED_SKILLS } from "./embedded-skills.js";

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
  test("embeds the distinct 8-skill installable set", () => {
    expect(EMBEDDED_SKILLS.map((skill) => skill.name)).toEqual([
      "meow-archive",
      "meow-code",
      "meow-dataset",
      "meow-execute",
      "meow-flow",
      "meow-plan",
      "meow-review",
      "meow-validate",
    ]);
  });

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
    expect(result.stdout).toContain(`Installed 8 skills for codex at ${codexHome}/skills`);
    expect(result.stdout).toContain(`Installed 8 skills for claude at ${claudeConfigDir}/skills`);
    expect(result.stdout).toContain(
      `Installed 8 skills for opencode at ${opencodeConfigDir}/skills`,
    );
    expect(result.stdout).toContain("  meow-archive\n");
    expect(result.stdout).toContain("  meow-code\n");
    expect(result.stdout).toContain("  meow-dataset\n");
    expect(result.stdout).toContain("  meow-flow\n");
    expect(result.stdout).toContain("  meow-validate\n");
    expect(result.stdout).not.toContain("  team-harness-workflow\n");
    expect(result.stdout).not.toContain("  paseo\n");

    expect(readFileSync(path.join(codexHome, "skills", "meow-code", "SKILL.md"), "utf8")).toContain(
      "name: meow-code",
    );
    expect(
      readFileSync(path.join(claudeConfigDir, "skills", "meow-plan", "SKILL.md"), "utf8"),
    ).toContain("name: meow-plan");
    const installedMeowFlowSkill = readFileSync(
      path.join(codexHome, "skills", "meow-flow", "SKILL.md"),
      "utf8",
    );
    expect(installedMeowFlowSkill).toContain("name: meow-flow");
    expect(installedMeowFlowSkill).toContain("mfl run --stage plan --provider <provider>");
    expect(
      readFileSync(path.join(codexHome, "skills", "meow-archive", "SKILL.md"), "utf8"),
    ).toContain("name: meow-archive");
    expect(
      readFileSync(path.join(opencodeConfigDir, "skills", "meow-execute", "SKILL.md"), "utf8"),
    ).toContain("name: meow-execute");
    expect(
      readFileSync(path.join(codexHome, "skills", "meow-dataset", "agents", "openai.yaml"), "utf8"),
    ).toContain("Meow Dataset");
    expect(existsSync(path.join(codexHome, "skills", "team-harness-workflow", "SKILL.md"))).toBe(
      false,
    );
    expect(existsSync(path.join(codexHome, "skills", "paseo", "SKILL.md"))).toBe(false);
  });

  test("lists embedded skills by default without installing", () => {
    const homeDirectory = createTempDirectory("meow-flow-skills-list-default-");

    const result = runCli(["install-skills"], homeDirectory, {
      env: {
        HOME: homeDirectory,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Embedded MeowFlow skills:");
    expect(result.stdout).toContain("  meow-archive\n");
    expect(result.stdout).toContain("  meow-code\n");
    expect(result.stdout).toContain("  meow-dataset\n");
    expect(result.stdout).toContain("  meow-flow\n");
    expect(result.stdout).toContain("  meow-validate\n");
    expect(result.stdout).not.toContain("  team-harness-workflow\n");
    expect(result.stdout).not.toContain("  paseo\n");
    expect(result.stdout).toContain("Install with: mfl install-skills <provider...>");
    expect(result.stdout).toContain("Supported providers: claude, codex, opencode, agents");
    expect(existsSync(path.join(homeDirectory, ".codex", "skills"))).toBe(false);
  });

  test("lists embedded skills explicitly without installing", () => {
    const homeDirectory = createTempDirectory("meow-flow-skills-list-explicit-");

    const result = runCli(["install-skills", "--list", "codex", "claude"], homeDirectory, {
      env: {
        HOME: homeDirectory,
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Embedded MeowFlow skills:");
    expect(result.stdout).toContain("  meow-archive\n");
    expect(result.stdout).toContain("  meow-code\n");
    expect(result.stdout).toContain("  meow-dataset\n");
    expect(result.stdout).toContain("  meow-flow\n");
    expect(result.stdout).toContain("  meow-validate\n");
    expect(result.stdout).not.toContain("  team-harness-workflow\n");
    expect(result.stdout).not.toContain("  paseo\n");
    expect(existsSync(path.join(homeDirectory, ".codex", "skills"))).toBe(false);
  });

  test("rejects unsupported providers", () => {
    const homeDirectory = createTempDirectory("meow-flow-skills-no-provider-");

    const result = runCli(["install-skills", "not-a-provider"], homeDirectory, {
      env: {
        HOME: homeDirectory,
      },
    });

    expect(result.status).toBe(1);
    expect(result.output).toContain('Unsupported LLM provider "not-a-provider"');
    expect(existsSync(path.join(homeDirectory, ".codex", "skills"))).toBe(false);
  });
});
