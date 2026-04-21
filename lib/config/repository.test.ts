import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGit } from "@/lib/cli-tools/git";
import {
  DEFAULT_UGIT_BROWSER_BASE_URL,
  REPOSITORY_UGIT_BROWSER_BASE_URL_CONFIG_KEY,
  readRepositoryHarnessConfig,
  resolveRepositoryUgitBrowserBaseUrl,
  writeRepositoryUgitBrowserBaseUrl,
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

describe("writeRepositoryUgitBrowserBaseUrl", () => {
  it("writes the ugit browser base URL into the repository-local git config", async () => {
    const repositoryPath = await createRepository();

    await expect(
      writeRepositoryUgitBrowserBaseUrl({
        cwd: repositoryPath,
        baseUrl: "http://ugit.example.test/review/",
      }),
    ).resolves.toEqual({
      repositoryPath,
      baseUrl: "http://ugit.example.test/review/",
    });

    await expect(
      runGit(repositoryPath, [
        "config",
        "--local",
        "--get",
        REPOSITORY_UGIT_BROWSER_BASE_URL_CONFIG_KEY,
      ]),
    ).resolves.toMatchObject({
      stdout: "http://ugit.example.test/review/",
    });
  });

  it("rejects invalid ugit browser base URLs", async () => {
    const repositoryPath = await createRepository();

    await expect(
      writeRepositoryUgitBrowserBaseUrl({
        cwd: repositoryPath,
        baseUrl: "not-a-url",
      }),
    ).rejects.toThrow("Ugit browser base URL must be an absolute URL.");
  });
});

describe("readRepositoryHarnessConfig", () => {
  it("returns null when the platform config is unset", async () => {
    const repositoryPath = await createRepository();

    await expect(readRepositoryHarnessConfig(repositoryPath)).resolves.toEqual({
      repositoryPath,
      platform: null,
      ugit: {
        browserBaseUrl: null,
      },
    });
  });

  it("includes the configured ugit browser base URL", async () => {
    const repositoryPath = await createRepository();
    await writeRepositoryUgitBrowserBaseUrl({
      cwd: repositoryPath,
      baseUrl: "http://ugit.example.test/review/",
    });

    await expect(readRepositoryHarnessConfig(repositoryPath)).resolves.toEqual({
      repositoryPath,
      platform: null,
      ugit: {
        browserBaseUrl: "http://ugit.example.test/review/",
      },
    });
  });
});

describe("resolveRepositoryUgitBrowserBaseUrl", () => {
  it("defaults to localhost when the ugit browser config is unset", async () => {
    const repositoryPath = await createRepository();

    await expect(resolveRepositoryUgitBrowserBaseUrl(repositoryPath)).resolves.toEqual({
      repositoryPath,
      baseUrl: DEFAULT_UGIT_BROWSER_BASE_URL,
    });
  });
});
