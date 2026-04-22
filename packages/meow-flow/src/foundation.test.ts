import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(THIS_DIR, "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");
const NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";

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
  const result = spawnSync(NPM_COMMAND, ["run", "cli:meow-flow", "--", ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });

  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
  };
}

describe("meow-flow foundation", () => {
  test("npm run cli:meow-flow -- --version succeeds and prints the package version", () => {
    const expectedVersion = readPackageVersion();
    const result = runCliAlias(["--version"]);

    expect(result.status).toBe(0);
    expect(result.output).toContain(expectedVersion);
  });

  test("npm run cli:meow-flow -- --help succeeds and prints help output", () => {
    const result = runCliAlias(["--help"]);

    expect(result.status).toBe(0);
    expect(result.output).toContain("Usage: meow-flow");
    expect(result.output).toContain("Options:");
    expect(result.output).toContain("--version");
  });
});
