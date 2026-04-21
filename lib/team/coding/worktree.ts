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

const parseManagedWorktreeSlotName = (value: string): number | null => {
  const match = /^meow-(\d+)$/u.exec(value.trim());
  if (!match) {
    return null;
  }

  const slot = Number.parseInt(match[1] ?? "", 10);
  return Number.isSafeInteger(slot) && slot > 0 ? slot : null;
};

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
  return parseManagedWorktreeSlotName(normalizedRelativePath);
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

export const parseManagedWorktreeSlotFromPath = (worktreePath: string): number | null => {
  return parseManagedWorktreeSlotName(path.basename(worktreePath));
};

export const resolveManagedWorktree = ({
  rootPath,
  path: worktreePath,
  slot,
}: {
  rootPath: string;
  path?: string | null;
  slot?: number | null;
}): Worktree | null => {
  const resolvedSlot =
    (typeof slot === "number" && slot > 0 ? slot : null) ??
    (worktreePath
      ? (parseManagedWorktreeSlot({
          rootPath,
          path: worktreePath,
        }) ?? parseManagedWorktreeSlotFromPath(worktreePath))
      : null);

  if (resolvedSlot) {
    return createManagedWorktree({
      rootPath,
      slot: resolvedSlot,
    });
  }

  if (!worktreePath) {
    return null;
  }

  return createWorktree({
    path: worktreePath,
    rootPath,
  });
};
