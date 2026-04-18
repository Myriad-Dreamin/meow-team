import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGit } from "@/lib/cli-tools/git";
import { writeRepositoryPlatformConfig } from "@/lib/config/repository";
import {
  resolveConfiguredGitPlatformId,
  resolvePushRemote,
  UnsupportedGitPlatformError,
} from "@/lib/platform";

const temporaryDirectories = new Set<string>();

const createRepository = async (): Promise<string> => {
  const repositoryPath = await mkdtemp(path.join(os.tmpdir(), "platform-config-test-"));
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

describe("resolveConfiguredGitPlatformId", () => {
  it("defaults to github when the repository config is unset", async () => {
    const repositoryPath = await createRepository();

    await expect(resolveConfiguredGitPlatformId(repositoryPath)).resolves.toBe("github");
  });
});

describe("resolvePushRemote", () => {
  it("uses the GitHub adapter when the repository config is unset", async () => {
    const repositoryPath = await createRepository();
    await runGit(repositoryPath, [
      "remote",
      "add",
      "origin",
      "https://github.com/example/meow-team.git",
    ]);

    await expect(
      resolvePushRemote({
        repositoryPath,
      }),
    ).resolves.toEqual({
      remoteName: "origin",
      fetchUrl: "https://github.com/example/meow-team.git",
      pushUrl: "https://github.com/example/meow-team.git",
      repositoryUrl: "https://github.com/example/meow-team",
    });
  });

  it("fails early when ugit is configured", async () => {
    const repositoryPath = await createRepository();
    await writeRepositoryPlatformConfig({
      cwd: repositoryPath,
      platform: "ugit",
    });

    await expect(
      resolvePushRemote({
        repositoryPath,
      }),
    ).rejects.toThrowError(
      new UnsupportedGitPlatformError({
        platformId: "ugit",
        repositoryPath,
      }),
    );
  });

  it("fails clearly for an unknown configured platform", async () => {
    const repositoryPath = await createRepository();
    await runGit(repositoryPath, ["config", "--local", "meow-team.platform", "gitlab"]);

    await expect(
      resolvePushRemote({
        repositoryPath,
      }),
    ).rejects.toThrow(
      `Repository ${repositoryPath} is configured to use the unsupported "gitlab" platform.`,
    );
  });
});
