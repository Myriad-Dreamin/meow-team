import { spawnSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(THIS_DIR, "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");
const NPM_COMMAND =
  process.env.NPM_COMMAND?.trim() || (process.platform === "win32" ? "pnpm.cmd" : "pnpm");
const BIN_PATH = path.join(PACKAGE_ROOT, "bin", "mfl");
const testIfPosix = process.platform === "win32" ? test.skip : test;

function needsRunArgSeparator(command: string): boolean {
  const commandName = command.split(/[/\\]/).at(-1)?.toLowerCase() ?? command.toLowerCase();

  return commandName === "npm" || commandName === "npm.cmd";
}

function readPackageVersion(): string {
  const packageJson = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")) as {
    version?: unknown;
  };

  if (typeof packageJson.version !== "string" || packageJson.version.trim().length === 0) {
    throw new Error("Expected meow-flow package.json to contain a version string.");
  }

  return packageJson.version.trim();
}

function runCliAlias(args: string[]) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "meow-flow-foundation-"));
  const outputPath = path.join(tempDir, "cli-output.txt");
  const outputFd = openSync(outputPath, "w");

  const result = spawnSync(
    NPM_COMMAND,
    ["run", "cli:mfl", ...(needsRunArgSeparator(NPM_COMMAND) ? ["--"] : []), ...args],
    {
      cwd: REPO_ROOT,
      stdio: ["ignore", outputFd, outputFd],
    },
  );

  closeSync(outputFd);
  const output = readFileSync(outputPath, "utf8");
  rmSync(tempDir, { recursive: true, force: true });

  return {
    status: result.status,
    output,
  };
}

describe("mfl foundation", () => {
  testIfPosix("bin/mfl is executable for direct invocation after build", () => {
    const mode = statSync(BIN_PATH).mode & 0o777;

    expect(mode & 0o111).not.toBe(0);
  });

  test("run cli:mfl --version succeeds and prints the package version", () => {
    const expectedVersion = readPackageVersion();
    const result = runCliAlias(["--version"]);

    expect(result.status).toBe(0);
    expect(result.output).toContain(expectedVersion);
  });

  test("run cli:mfl --help succeeds and prints help output", () => {
    const result = runCliAlias(["--help"]);

    expect(result.status).toBe(0);
    expect(result.output).toContain("Usage: mfl");
    expect(result.output).toContain("install-skills");
    expect(result.output).toContain("status");
    expect(result.output).toContain("run");
    expect(result.output).toContain("worktree");
    expect(result.output).toContain("thread");
    expect(result.output).toContain("agent");
    expect(result.output).toContain("handoff");
    expect(result.output).not.toContain("config");
    expect(result.output).not.toContain("plan");
    expect(result.output).not.toContain("delete");
    expect(result.output).not.toContain("workspace");
    expect(result.output).toContain("Options:");
    expect(result.output).toContain("--version");
  });

  test("run cli:mfl run --help succeeds and prints launch options", () => {
    const result = runCliAlias(["run", "--help"]);

    expect(result.status).toBe(0);
    expect(result.output).toContain("Usage: mfl run");
    expect(result.output).toContain("[request-body]");
    expect(result.output).toContain("--id");
    expect(result.output).toContain("--stage");
    expect(result.output).not.toContain("--config");
  });

  test("run cli:mfl install-skills --help succeeds and prints provider guidance", () => {
    const result = runCliAlias(["install-skills", "--help"]);

    expect(result.status).toBe(0);
    expect(result.output).toContain("Usage: mfl install-skills");
    expect(result.output).toContain("[providers...]");
    expect(result.output).toContain("claude, codex, opencode");
    expect(result.output).toContain("--list");
  });

  test("run cli:mfl worktree --help succeeds and prints worktree subcommands", () => {
    const result = runCliAlias(["worktree", "--help"]);

    expect(result.status).toBe(0);
    expect(result.output).toContain("Usage: mfl worktree");
    expect(result.output).toContain("new");
    expect(result.output).toContain("ls");
    expect(result.output).toContain("list");
    expect(result.output).toContain("rm");
    expect(result.output).toContain("remove");
  });
});
