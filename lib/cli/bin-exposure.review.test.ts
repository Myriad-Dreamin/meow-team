import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

const getPnpmCommand = (): {
  args: string[];
  command: string;
} => {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, "exec", "meow-team", "--version"],
    };
  }

  return {
    command: "pnpm",
    args: ["exec", "meow-team", "--version"],
  };
};

describe("pnpm exec meow-team", () => {
  it("exposes the CLI binary from the workspace root", async () => {
    const { command, args } = getPnpmCommand();
    const result = spawnSync(command, args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "ignore", "pipe"],
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe("");
  });
});
