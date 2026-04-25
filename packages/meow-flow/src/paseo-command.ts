import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type PaseoCommandInvocation = {
  readonly command: string;
  readonly argsPrefix: readonly string[];
};

const SOURCE_FILE_PATH = fileURLToPath(import.meta.url);
const SOURCE_DIRECTORY = path.dirname(SOURCE_FILE_PATH);

export function resolvePaseoCommandInvocation(): PaseoCommandInvocation {
  const overrideCommand = process.env.MFL_PASEO_BIN?.trim();

  if (overrideCommand) {
    return {
      command: overrideCommand,
      argsPrefix: [],
    };
  }

  const sourceRoot = findPaseoSourceRoot(SOURCE_DIRECTORY);

  if (sourceRoot) {
    const cliBinPath = path.join(sourceRoot, "packages", "cli", "bin", "paseo");
    const cliDistPath = path.join(sourceRoot, "packages", "cli", "dist", "index.js");

    if (!existsSync(cliDistPath)) {
      throw new Error(
        `Local Paseo CLI build is missing at ${cliDistPath}. Run pnpm run build:daemon before mfl run.`,
      );
    }

    return {
      command: process.execPath,
      argsPrefix: ["--disable-warning=DEP0040", cliBinPath],
    };
  }

  return {
    command: "paseo",
    argsPrefix: [],
  };
}

function findPaseoSourceRoot(startDirectory: string): string | null {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    const packageJsonPath = path.join(currentDirectory, "package.json");
    const paseoCliBinPath = path.join(currentDirectory, "packages", "cli", "bin", "paseo");

    if (existsSync(packageJsonPath) && existsSync(paseoCliBinPath)) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return null;
    }

    currentDirectory = parentDirectory;
  }
}
