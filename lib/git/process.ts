import path from "node:path";

const isSafePathEntry = (entry: string): boolean => {
  if (!entry || !path.isAbsolute(entry)) {
    return false;
  }

  return !entry.split(path.sep).join("/").includes("/node_modules/.bin");
};

export const buildGitProcessEnv = (env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv => {
  const sanitizedPath = (env.PATH ?? "")
    .split(path.delimiter)
    .filter(isSafePathEntry)
    .join(path.delimiter);

  return {
    ...env,
    PATH: sanitizedPath,
  };
};
