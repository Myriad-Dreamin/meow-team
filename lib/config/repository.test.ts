import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGit } from "@/lib/cli-tools/git";
import {
  readRepositoryHarnessConfig,
  writeRepositoryPlatformConfig,
} from "@/lib/config/repository";

const temporaryDirectories = new Set<string>();

const createRepository = async (): Promise<string> => {
  const repositoryPath = await mkdtemp(path.join(os.tmpdir(), "repository-config-test-"));
  temporaryDirectories.add(repositoryPath);
  await runGit(repositoryPath, ["init", "-b", "main"]);
  await runGit(repositoryPath, ["config", "user.name", "Test User"]);
  await runGit(repositoryPath, ["config", "user.email", "test@example.com"]);
  return repositoryPath;
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

describe("writeRepositoryPlatformConfig", () => {
  it("writes github into the repository-local git config", async () => {
    const repositoryPath = await createRepository();

    await expect(
      writeRepositoryPlatformConfig({
        cwd: repositoryPath,
        platform: "github",
      }),
    ).resolves.toEqual({
      repositoryPath,
      platform: "github",
    });

    await expect(
      runGit(repositoryPath, ["config", "--local", "--get", "meow-team.platform"]),
    ).resolves.toMatchObject({
      stdout: "github",
    });
  });

  it("writes ugit into the repository-local git config", async () => {
    const repositoryPath = await createRepository();

    await expect(
      writeRepositoryPlatformConfig({
        cwd: repositoryPath,
        platform: "ugit",
      }),
    ).resolves.toEqual({
      repositoryPath,
      platform: "ugit",
    });

    await expect(
      runGit(repositoryPath, ["config", "--local", "--get", "meow-team.platform"]),
    ).resolves.toMatchObject({
      stdout: "ugit",
    });
  });

  it("rejects outside a git repository or worktree", async () => {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), "repository-config-missing-"));
    temporaryDirectories.add(directoryPath);

    await expect(
      writeRepositoryPlatformConfig({
        cwd: directoryPath,
        platform: "github",
      }),
    ).rejects.toThrow("This command requires a Git repository or worktree.");
  });
});

describe("readRepositoryHarnessConfig", () => {
  it("returns null when the platform config is unset", async () => {
    const repositoryPath = await createRepository();

    await expect(readRepositoryHarnessConfig(repositoryPath)).resolves.toEqual({
      repositoryPath,
      platform: null,
    });
  });
});
