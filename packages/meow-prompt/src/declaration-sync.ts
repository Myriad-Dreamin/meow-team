import { promises as fs, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compilePromptModule, getPromptTemplateDeclarationPath } from "./compiler";

const defaultRuntimeModulePath = fileURLToPath(new URL("./runtime", import.meta.url));
const promptTemplateBootstrapRoots = [
  "/app",
  "/docs",
  "/lib/team/roles",
  "/prompts/roles",
] as const;
const promptTemplateBootstrapPatterns = promptTemplateBootstrapRoots.flatMap((root) => [
  `${root}/**/*.prompt.md`,
  `${root}/**/*.template.md`,
]);

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

export const createPromptTemplateBootstrapModule = (): string => {
  return `export const promptTemplates = import.meta.glob(${JSON.stringify(promptTemplateBootstrapPatterns)}, { eager: true });
`;
};
