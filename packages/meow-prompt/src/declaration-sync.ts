import { promises as fs, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compilePromptModule,
  getPromptTemplateDeclarationPath,
  isPromptTemplatePath,
} from "./compiler";

type SyncOptions = {
  rootDirectory: string;
  runtimeModulePath?: string;
};

const defaultRuntimeModulePath = fileURLToPath(new URL("./runtime", import.meta.url));

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

const walkDirectorySync = (directoryPath: string): string[] => {
  const entries = readdirSync(directoryPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      files.push(...walkDirectorySync(entryPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
};

const getTemplateFiles = (files: string[]): string[] => {
  return files.filter((filePath) => isPromptTemplatePath(filePath)).sort();
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

const writeFileIfChangedSync = (filePath: string, contents: string): void => {
  let currentContents: string | null = null;

  try {
    currentContents = readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  if (currentContents === contents) {
    return;
  }

  writeFileSync(filePath, contents, "utf8");
};

export const writePromptTemplateDeclaration = async (
  source: string,
  resourcePath: string,
  runtimeModulePath = defaultRuntimeModulePath,
) => {
  const compiledModule = compilePromptModule(source, {
    resourcePath,
    runtimeModulePath,
  });

  await writeFileIfChanged(getPromptTemplateDeclarationPath(resourcePath), compiledModule.dts);

  return compiledModule;
};

export const writePromptTemplateDeclarationSync = (
  source: string,
  resourcePath: string,
  runtimeModulePath = defaultRuntimeModulePath,
) => {
  const compiledModule = compilePromptModule(source, {
    resourcePath,
    runtimeModulePath,
  });

  writeFileIfChangedSync(getPromptTemplateDeclarationPath(resourcePath), compiledModule.dts);

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
  const templateFiles = getTemplateFiles(files);
  const runtimeModulePath = options.runtimeModulePath ?? defaultRuntimeModulePath;

  for (const templateFilePath of templateFiles) {
    const source = await fs.readFile(templateFilePath, "utf8");

    await writePromptTemplateDeclaration(source, templateFilePath, runtimeModulePath);
  }

  return templateFiles;
};

export const syncPromptTemplateDeclarationsSync = (options: SyncOptions): string[] => {
  const files = walkDirectorySync(options.rootDirectory);
  const templateFiles = getTemplateFiles(files);
  const runtimeModulePath = options.runtimeModulePath ?? defaultRuntimeModulePath;

  for (const templateFilePath of templateFiles) {
    const source = readFileSync(templateFilePath, "utf8");

    writePromptTemplateDeclarationSync(source, templateFilePath, runtimeModulePath);
  }

  return templateFiles;
};
