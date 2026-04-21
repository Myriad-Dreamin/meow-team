import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { runGit } from "@/lib/cli-tools/git";
import { runMeowTeamCli } from "@/lib/cli/app";
import { readRepositoryHarnessConfig } from "@/lib/config/repository";

const temporaryDirectories = new Set<string>();

const createRepository = async (): Promise<string> => {
  const repositoryPath = await mkdtemp(path.join(os.tmpdir(), "meow-team-cli-test-"));
  temporaryDirectories.add(repositoryPath);
  await runGit(repositoryPath, ["init", "-b", "main"]);
  await runGit(repositoryPath, ["config", "user.name", "Test User"]);
  await runGit(repositoryPath, ["config", "user.email", "test@example.com"]);
  return repositoryPath;
};

const createOutputCapture = (): {
  output: () => string;
  stream: Writable;
} => {
  let value = "";

  return {
    output: () => value,
    stream: new Writable({
      write(chunk, _encoding, callback) {
        value += chunk.toString();
        callback();
      },
    }),
  };
};

afterEach(async () => {
  await Promise.all(
    [...temporaryDirectories].map(async (directoryPath) => {
      await rm(directoryPath, {
        force: true,
        recursive: true,
      });
    }),
  );

  temporaryDirectories.clear();
});

describe("runMeowTeamCli", () => {
  it("shows the available repository-local config commands", async () => {
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    await expect(
      runMeowTeamCli(["config"], {
        stdout: stdout.stream,
        stderr: stderr.stream,
      }),
    ).resolves.toBe(0);

    expect(stdout.output()).toContain("meow-team config platform <github|ugit>");
    expect(stdout.output()).toContain("meow-team config ugit base-url <url>");
    expect(stderr.output()).toBe("");
  });

  it("persists github platform selection for the current repository", async () => {
    const repositoryPath = await createRepository();
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    await expect(
      runMeowTeamCli(["config", "platform", "github"], {
        cwd: repositoryPath,
        stdout: stdout.stream,
        stderr: stderr.stream,
      }),
    ).resolves.toBe(0);

    expect(stdout.output()).toContain("Repository platform is now github.");
    expect(stderr.output()).toBe("");
    await expect(readRepositoryHarnessConfig(repositoryPath)).resolves.toEqual({
      repositoryPath,
      platform: "github",
      ugit: {
        browserBaseUrl: null,
      },
    });
  });

  it("accepts ugit selection even before the adapter exists", async () => {
    const repositoryPath = await createRepository();
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    await expect(
      runMeowTeamCli(["config", "platform", "ugit"], {
        cwd: repositoryPath,
        stdout: stdout.stream,
        stderr: stderr.stream,
      }),
    ).resolves.toBe(0);

    expect(stdout.output()).toContain("Repository platform is now ugit.");
    expect(stderr.output()).toBe("");
    await expect(readRepositoryHarnessConfig(repositoryPath)).resolves.toEqual({
      repositoryPath,
      platform: "ugit",
      ugit: {
        browserBaseUrl: null,
      },
    });
  });

  it("persists ugit browser base-url overrides for the current repository", async () => {
    const repositoryPath = await createRepository();
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    await expect(
      runMeowTeamCli(["config", "ugit", "base-url", "http://ugit.example.test/review/"], {
        cwd: repositoryPath,
        stdout: stdout.stream,
        stderr: stderr.stream,
      }),
    ).resolves.toBe(0);

    expect(stdout.output()).toContain(
      "Repository ugit browser base URL is now http://ugit.example.test/review/.",
    );
    expect(stderr.output()).toBe("");
    await expect(readRepositoryHarnessConfig(repositoryPath)).resolves.toEqual({
      repositoryPath,
      platform: null,
      ugit: {
        browserBaseUrl: "http://ugit.example.test/review/",
      },
    });
  });

  it("reports invalid ugit browser base URLs as usage errors", async () => {
    const repositoryPath = await createRepository();
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    await expect(
      runMeowTeamCli(["config", "ugit", "base-url", "not-a-url"], {
        cwd: repositoryPath,
        stdout: stdout.stream,
        stderr: stderr.stream,
      }),
    ).resolves.toBe(1);

    expect(`${stdout.output()}${stderr.output()}`).toContain(
      "Ugit browser base URL must be an absolute URL.",
    );
  });

  it("reports an actionable error outside a git repository", async () => {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), "meow-team-cli-missing-"));
    temporaryDirectories.add(directoryPath);
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    await expect(
      runMeowTeamCli(["config", "platform", "github"], {
        cwd: directoryPath,
        stdout: stdout.stream,
        stderr: stderr.stream,
      }),
    ).resolves.toBe(1);

    expect(`${stdout.output()}${stderr.output()}`).toContain(
      "This command requires a Git repository or worktree.",
    );
  });

  it("reports ugit base-url errors outside a git repository", async () => {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), "meow-team-cli-missing-"));
    temporaryDirectories.add(directoryPath);
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();

    await expect(
      runMeowTeamCli(["config", "ugit", "base-url", "http://localhost:17121/"], {
        cwd: directoryPath,
        stdout: stdout.stream,
        stderr: stderr.stream,
      }),
    ).resolves.toBe(1);

    expect(`${stdout.output()}${stderr.output()}`).toContain(
      "This command requires a Git repository or worktree.",
    );
  });
});
