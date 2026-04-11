import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const meowPromptTurbopackLoader = path.join(
  rootDirectory,
  "packages",
  "meow-prompt",
  "turbopack-loader.cjs",
);

const containsPath = (parentDirectory: string, nestedPath: string): boolean => {
  const relativePath = path.relative(parentDirectory, nestedPath);

  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
};

const resolveTurbopackRoot = (): string => {
  try {
    // Worktree node_modules is a symlink into the shared repo root.
    const nodeModulesRoot = path.dirname(realpathSync(path.join(rootDirectory, "node_modules")));
    let candidateDirectory = rootDirectory;

    while (!containsPath(candidateDirectory, nodeModulesRoot)) {
      const parentDirectory = path.dirname(candidateDirectory);

      if (parentDirectory === candidateDirectory) {
        return rootDirectory;
      }

      candidateDirectory = parentDirectory;
    }

    return candidateDirectory;
  } catch {
    return rootDirectory;
  }
};

const nextConfig: NextConfig = {
  turbopack: {
    root: resolveTurbopackRoot(),
    rules: {
      "*.prompt.md": {
        loaders: [meowPromptTurbopackLoader],
        as: "*.js",
      },
      "*.template.md": {
        loaders: [meowPromptTurbopackLoader],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
