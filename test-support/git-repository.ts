import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runGit } from "@/lib/cli-tools/git";

const temporaryDirectories = new Set<string>();

export const createTemporaryDirectory = async (prefix: string): Promise<string> => {
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.add(directoryPath);
  return directoryPath;
};

export const createTemporaryGitRepository = async (): Promise<string> => {
  const repositoryPath = await createTemporaryDirectory("meow-team-git-test-");
  await runGit(repositoryPath, ["init", "-b", "main"]);
  await runGit(repositoryPath, ["config", "user.name", "Test User"]);
  await runGit(repositoryPath, ["config", "user.email", "test@example.com"]);
  return repositoryPath;
};

export const readLocalGitConfig = async (
  repositoryPath: string,
  key: string,
): Promise<string | null> => {
  try {
    const { stdout } = await runGit(repositoryPath, ["config", "--local", "--get", key]);
    return stdout || null;
  } catch {
    return null;
  }
};

export const cleanupTemporaryDirectories = async (): Promise<void> => {
  await Promise.all(
    [...temporaryDirectories].map(async (directoryPath) => {
      await fs.rm(directoryPath, {
        recursive: true,
        force: true,
      });
    }),
  );

  temporaryDirectories.clear();
};
