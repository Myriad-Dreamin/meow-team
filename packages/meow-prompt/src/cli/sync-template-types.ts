import { promises as fs } from "node:fs";
import path from "node:path";
import {
  compilePromptModule,
  getPromptTemplateDeclarationPath,
  isPromptTemplatePath,
} from "../compiler";

type SyncOptions = {
  rootDirectory?: string;
};

const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".pnpm-store",
  ".turbo",
  ".yarn",
  "build",
  "dist",
  "node_modules",
  "out",
]);

const runtimeModulePath = path.resolve(__dirname, "..", "runtime");

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

export const syncPromptTemplateDeclarations = async (
  options: SyncOptions = {},
): Promise<string[]> => {
  const rootDirectory = options.rootDirectory ?? process.cwd();
  const files = await walkDirectory(rootDirectory);
  const templateFiles = files.filter((filePath) => isPromptTemplatePath(filePath)).sort();

  for (const templateFilePath of templateFiles) {
    const source = await fs.readFile(templateFilePath, "utf8");
    const compiledModule = compilePromptModule(source, {
      resourcePath: templateFilePath,
      runtimeModulePath,
    });

    await writeFileIfChanged(
      getPromptTemplateDeclarationPath(templateFilePath),
      compiledModule.dts,
    );
  }

  return templateFiles;
};

if (require.main === module) {
  syncPromptTemplateDeclarations().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
