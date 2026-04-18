import { PassThrough } from "node:stream";
import path from "node:path";
import { Cli } from "clipanion";
import { afterEach, describe, expect, it } from "vitest";
import { createCli } from "@/lib/cli/create-cli";
import {
  cleanupTemporaryDirectories,
  createTemporaryDirectory,
  createTemporaryGitRepository,
  readLocalGitConfig,
} from "@/test-support/git-repository";

afterEach(async () => {
  await cleanupTemporaryDirectories();
});

describe("meow-team CLI", () => {
  it("writes platform config for the repository containing the current directory", async () => {
    const repositoryPath = await createTemporaryGitRepository();
    const nestedDirectory = path.join(repositoryPath, "nested", "path");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(nestedDirectory, { recursive: true });

    const { exitCode, stdout, stderr } = await runCli(["config", "platform", "ugit"], {
      cwd: nestedDirectory,
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain('Configured git platform "ugit"');
    expect(stdout).toContain(repositoryPath);
    expect(await readLocalGitConfig(repositoryPath, "meow-team.platform")).toBe("ugit");
  });

  it("fails fast outside a git repository", async () => {
    const directoryPath = await createTemporaryDirectory("meow-team-cli-test-");

    const { exitCode, stdout, stderr } = await runCli(["config", "platform", "github"], {
      cwd: directoryPath,
    });

    expect(exitCode).toBe(1);
    expect(`${stdout}${stderr}`).toContain("Repository not found:");
  });

  it("documents the supported platform IDs in command help", async () => {
    const { exitCode, stdout, stderr } = await runCli(["config", "platform", "--help"]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("github");
    expect(stdout).toContain("ugit");
    expect(stdout).toContain("meow-team.platform");
  });
});

async function runCli(
  argv: string[],
  options: {
    cwd?: string;
  } = {},
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let stdoutText = "";
  let stderrText = "";

  stdout.on("data", (chunk) => {
    stdoutText += chunk.toString();
  });
  stderr.on("data", (chunk) => {
    stderrText += chunk.toString();
  });

  const previousCwd = process.cwd();
  if (options.cwd) {
    process.chdir(options.cwd);
  }

  try {
    const exitCode = await createCli().run(argv, {
      ...Cli.defaultContext,
      stdout,
      stderr,
    });

    return {
      exitCode,
      stdout: stdoutText,
      stderr: stderrText,
    };
  } finally {
    process.chdir(previousCwd);
  }
}
