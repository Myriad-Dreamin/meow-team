import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import type { TeamConfig } from "@/lib/config/team";
import type { TeamRepositoryOption } from "@/lib/git/repository";

export type ResolvedTeamRepositoryRoot = {
  id: string;
  label: string;
  directory: string;
};

const isWithinDirectory = (targetPath: string, rootDirectory: string): boolean => {
  return targetPath === rootDirectory || targetPath.startsWith(`${rootDirectory}${path.sep}`);
};

const createRepositoryId = (rootId: string, relativePath: string): string => {
  return `${rootId}:${relativePath || "."}`;
};

const isAccessibleDirectory = async (directory: string): Promise<boolean> => {
  try {
    const stats = await fs.stat(directory);
    return stats.isDirectory();
  } catch {
    return false;
  }
};

const hasGitEntry = async (directory: string): Promise<boolean> => {
  try {
    const stats = await fs.lstat(path.join(directory, ".git"));
    return stats.isDirectory() || stats.isFile();
  } catch {
    return false;
  }
};

const createRepositoryOption = (
  root: ResolvedTeamRepositoryRoot,
  repositoryPath: string,
): TeamRepositoryOption => {
  const relativePath = path.relative(root.directory, repositoryPath) || ".";

  return {
    id: createRepositoryId(root.id, relativePath),
    name: path.basename(repositoryPath),
    rootId: root.id,
    rootLabel: root.label,
    path: repositoryPath,
    relativePath,
  };
};

const listRepositoriesForRoot = async (
  root: ResolvedTeamRepositoryRoot,
): Promise<TeamRepositoryOption[]> => {
  if (!(await isAccessibleDirectory(root.directory))) {
    return [];
  }

  const repositories: TeamRepositoryOption[] = [];

  if (await hasGitEntry(root.directory)) {
    repositories.push(createRepositoryOption(root, root.directory));
  }

  const entries = await fs.readdir(root.directory, { withFileTypes: true });

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        return;
      }

      const candidatePath = path.join(root.directory, entry.name);
      if (!isWithinDirectory(candidatePath, root.directory)) {
        return;
      }

      if (await hasGitEntry(candidatePath)) {
        repositories.push(createRepositoryOption(root, candidatePath));
      }
    }),
  );

  return repositories.sort((left, right) => {
    return left.relativePath.localeCompare(right.relativePath);
  });
};

export const resolveConfiguredRepositoryRoots = (
  config: TeamConfig,
): ResolvedTeamRepositoryRoot[] => {
  return (config.repositories?.roots ?? []).map((root) => {
    return {
      id: root.id,
      label: root.label,
      directory: root.directory,
    };
  });
};

export const listConfiguredRepositories = async (
  config: TeamConfig,
): Promise<TeamRepositoryOption[]> => {
  const roots = resolveConfiguredRepositoryRoots(config);
  const repositoriesByRoot = await Promise.all(roots.map((root) => listRepositoriesForRoot(root)));

  return repositoriesByRoot.flat().sort((left, right) => {
    if (left.rootLabel !== right.rootLabel) {
      return left.rootLabel.localeCompare(right.rootLabel);
    }

    return left.relativePath.localeCompare(right.relativePath);
  });
};

export const findConfiguredRepository = async (
  config: TeamConfig,
  repositoryId: string | undefined,
): Promise<TeamRepositoryOption | null> => {
  if (!repositoryId) {
    return null;
  }

  const repositories = await listConfiguredRepositories(config);
  return repositories.find((repository) => repository.id === repositoryId) ?? null;
};
