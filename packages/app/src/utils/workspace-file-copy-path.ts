import { buildAbsoluteExplorerPath } from "@/utils/explorer-paths";
import { isAbsolutePath } from "@/utils/path";

interface ResolveWorkspaceFileCopyPathInput {
  path: string;
  directory?: string;
  workspaceDirectory?: string | null;
}

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRelativePath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/g, "");
}

function pathAlreadyIncludesDirectory(path: string, directory: string): boolean {
  const normalizedPath = normalizeRelativePath(path);
  const normalizedDirectory = normalizeRelativePath(directory);
  if (!normalizedDirectory || normalizedDirectory === ".") {
    return true;
  }
  return (
    normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}/`)
  );
}

function joinRelativeDirectoryPath(directory: string, path: string): string {
  if (pathAlreadyIncludesDirectory(path, directory)) {
    return path;
  }
  const normalizedDirectory = normalizeRelativePath(directory);
  if (!normalizedDirectory || normalizedDirectory === ".") {
    return path;
  }
  return `${normalizedDirectory}/${path.replace(/^\.?[\\/]+/, "")}`;
}

export function resolveWorkspaceFileCopyPath(input: ResolveWorkspaceFileCopyPathInput): string {
  const path = trimNonEmpty(input.path);
  if (!path || isAbsolutePath(path)) {
    return path ?? "";
  }

  const directory = trimNonEmpty(input.directory);
  const workspaceDirectory = trimNonEmpty(input.workspaceDirectory);

  if (directory && isAbsolutePath(directory)) {
    return buildAbsoluteExplorerPath({
      workspaceRoot: directory,
      entryPath: path,
    });
  }

  if (workspaceDirectory) {
    return buildAbsoluteExplorerPath({
      workspaceRoot: workspaceDirectory,
      entryPath: directory ? joinRelativeDirectoryPath(directory, path) : path,
    });
  }

  if (directory) {
    return buildAbsoluteExplorerPath({
      workspaceRoot: directory,
      entryPath: path,
    });
  }

  return path;
}
