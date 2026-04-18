import { afterEach, describe, expect, it } from "vitest";
import {
  readRepositoryPlatformId,
  repositoryConfigGitKeys,
  resolveGitRepositoryRoot,
  RepositoryNotFoundError,
  writeRepositoryPlatformId,
} from "@/lib/repository-config";
import {
  cleanupTemporaryDirectories,
  createTemporaryDirectory,
  createTemporaryGitRepository,
  readLocalGitConfig,
} from "@/test-support/git-repository";

afterEach(async () => {
  await cleanupTemporaryDirectories();
});

describe("resolveGitRepositoryRoot", () => {
  it("returns the containing repository for nested directories", async () => {
    const repositoryPath = await createTemporaryGitRepository();
    const nestedDirectory = `${repositoryPath}/nested/path`;
    const { mkdir } = await import("node:fs/promises");
    await mkdir(nestedDirectory, { recursive: true });

    await expect(resolveGitRepositoryRoot(nestedDirectory)).resolves.toBe(repositoryPath);
  });

  it("rejects directories outside a git repository", async () => {
    const directoryPath = await createTemporaryDirectory("meow-team-repository-config-test-");

    await expect(resolveGitRepositoryRoot(directoryPath)).rejects.toBeInstanceOf(
      RepositoryNotFoundError,
    );
  });
});

describe("repository platform config", () => {
  it("returns null when no repository-local platform is set", async () => {
    const repositoryPath = await createTemporaryGitRepository();

    await expect(readRepositoryPlatformId(repositoryPath)).resolves.toBeNull();
  });

  it("stores exact platform IDs independently per repository", async () => {
    const repositoryAPath = await createTemporaryGitRepository();
    const repositoryBPath = await createTemporaryGitRepository();

    await expect(writeRepositoryPlatformId(repositoryAPath, "ugit")).resolves.toBe("ugit");
    await expect(writeRepositoryPlatformId(repositoryBPath, "github")).resolves.toBe("github");

    await expect(readRepositoryPlatformId(repositoryAPath)).resolves.toBe("ugit");
    await expect(readRepositoryPlatformId(repositoryBPath)).resolves.toBe("github");
    expect(await readLocalGitConfig(repositoryAPath, repositoryConfigGitKeys.platform)).toBe(
      "ugit",
    );
    expect(await readLocalGitConfig(repositoryBPath, repositoryConfigGitKeys.platform)).toBe(
      "github",
    );
  });
});
