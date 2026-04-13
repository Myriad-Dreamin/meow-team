import path from "node:path";
import { z } from "zod";

export const worktreeSchema = z.object({
  path: z.string().trim().min(1),
  rootPath: z.string().trim().min(1).nullable(),
  slot: z.number().int().positive().nullable(),
});

export type Worktree = z.infer<typeof worktreeSchema>;

export type CreateWorktreeInput = {
  path: string;
  rootPath?: string | null;
};

export type CreateWorktree = (input: CreateWorktreeInput) => Worktree;

const parseManagedWorktreeSlot = ({
  rootPath,
  path: worktreePath,
}: {
  rootPath: string;
  path: string;
}): number | null => {
  const relativePath = path.relative(rootPath, worktreePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  const normalizedRelativePath = relativePath.split(path.sep).join("/");
  const match = /^meow-(\d+)$/u.exec(normalizedRelativePath);
  if (!match) {
    return null;
  }

  const slot = Number.parseInt(match[1] ?? "", 10);
  return Number.isSafeInteger(slot) && slot > 0 ? slot : null;
};

export const createWorktree: CreateWorktree = ({ path: worktreePath, rootPath = null }) => {
  return {
    path: worktreePath,
    rootPath,
    slot: rootPath ? parseManagedWorktreeSlot({ rootPath, path: worktreePath }) : null,
  };
};

export const createRepositoryWorktree = ({ path }: { path: string }): Worktree => {
  return createWorktree({ path });
};

export const createManagedWorktree = ({
  rootPath,
  slot,
}: {
  rootPath: string;
  slot: number;
}): Worktree => {
  return createWorktree({
    path: path.join(rootPath, `meow-${slot}`),
    rootPath,
  });
};

export const resolveManagedWorktreeRoot = ({
  repositoryPath,
  worktreeRoot,
}: {
  repositoryPath: string;
  worktreeRoot: string;
}): string => {
  return path.isAbsolute(worktreeRoot) ? worktreeRoot : path.join(repositoryPath, worktreeRoot);
};

export const resolveLaneWorktree = ({
  repositoryPath,
  worktreeRoot,
  worktreePath,
  create = createWorktree,
}: {
  repositoryPath: string;
  worktreeRoot: string;
  worktreePath: string | null | undefined;
  create?: CreateWorktree;
}): Worktree => {
  const rootPath = resolveManagedWorktreeRoot({
    repositoryPath,
    worktreeRoot,
  });

  return create({
    path: worktreePath ?? rootPath,
    rootPath,
  });
};
