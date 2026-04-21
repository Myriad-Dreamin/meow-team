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

const createResolvedWorktree = ({
  path: worktreePath,
  rootPath = null,
  slot = null,
}: {
  path: string;
  rootPath?: string | null;
  slot?: number | null;
}): Worktree => {
  return {
    path: worktreePath,
    rootPath,
    slot,
  };
};

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
  return createResolvedWorktree({
    path: worktreePath,
    rootPath,
    slot: rootPath ? parseManagedWorktreeSlot({ rootPath, path: worktreePath }) : null,
  });
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

const inferPersistedManagedWorktreeRoot = ({
  path: worktreePath,
  slot,
}: {
  path: string;
  slot: number | null;
}): string | null => {
  const parsedSlot = parseManagedWorktreeSlotFromPath(worktreePath);
  if (!parsedSlot || (slot && parsedSlot !== slot)) {
    return null;
  }

  return path.dirname(worktreePath);
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

export const resolvePersistedManagedWorktree = ({
  configuredRootPath,
  path: worktreePath,
  rootPath,
  slot,
}: {
  configuredRootPath: string;
  path?: string | null;
  rootPath?: string | null;
  slot?: number | null;
}): Worktree | null => {
  const resolvedSlot = typeof slot === "number" && slot > 0 ? slot : null;
  const persistedRootPath =
    rootPath?.trim() ||
    (worktreePath
      ? inferPersistedManagedWorktreeRoot({
          path: worktreePath,
          slot: resolvedSlot,
        })
      : null);

  if (worktreePath) {
    if (persistedRootPath) {
      return createWorktree({
        path: worktreePath,
        rootPath: persistedRootPath,
      });
    }

    return createResolvedWorktree({
      path: worktreePath,
      slot: resolvedSlot ?? parseManagedWorktreeSlotFromPath(worktreePath),
    });
  }

  if (!resolvedSlot) {
    return null;
  }

  return createManagedWorktree({
    rootPath: persistedRootPath ?? configuredRootPath,
    slot: resolvedSlot,
  });
};
