import { promises as fs } from "node:fs";
import path from "node:path";
import {
  compilePromptModule,
  getPromptTemplateDeclarationPath,
  isPromptTemplatePath,
} from "./compiler";

type SyncOptions = {
  rootDirectory: string;
  runtimeModulePath: string;
};

const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".meow-team-worktrees",
  ".next",
  ".pnpm-store",
  ".turbo",
  ".yarn",
  "build",
  "dist",
  "node_modules",
  "out",
]);

const walkDirectory = async (directoryPath: string): Promise<string[]> => {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      files.push(...(await walkDirectory(entryPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
};

const writeFileIfChanged = async (filePath: string, contents: string): Promise<void> => {
  let currentContents: string | null = null;

  try {
    currentContents = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  if (currentContents === contents) {
    return;
  }

  await fs.writeFile(filePath, contents, "utf8");
};

export const writePromptTemplateDeclaration = async (
  source: string,
  resourcePath: string,
  runtimeModulePath: string,
) => {
  const compiledModule = compilePromptModule(source, {
    resourcePath,
    runtimeModulePath,
  });

  await writeFileIfChanged(getPromptTemplateDeclarationPath(resourcePath), compiledModule.dts);

  return compiledModule;
};

export const removePromptTemplateDeclaration = async (resourcePath: string): Promise<void> => {
  try {
    await fs.unlink(getPromptTemplateDeclarationPath(resourcePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
};

export const syncPromptTemplateDeclarations = async (options: SyncOptions): Promise<string[]> => {
  const files = await walkDirectory(options.rootDirectory);
  const templateFiles = files.filter((filePath) => isPromptTemplatePath(filePath)).sort();

  for (const templateFilePath of templateFiles) {
    const source = await fs.readFile(templateFilePath, "utf8");

    await writePromptTemplateDeclaration(source, templateFilePath, options.runtimeModulePath);
  }

  return templateFiles;
};
