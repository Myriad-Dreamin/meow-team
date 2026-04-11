import fs from "node:fs";
import path from "node:path";
import { compilePromptModule, getPromptTemplateDeclarationPath } from "./compiler";

const runtimeModulePath = path.resolve(__dirname, "runtime");

const writeDeclarationIfChanged = (resourcePath: string, declarationSource: string): void => {
  const declarationPath = getPromptTemplateDeclarationPath(resourcePath);

  try {
    if (fs.readFileSync(declarationPath, "utf8") === declarationSource) {
      return;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  fs.writeFileSync(declarationPath, declarationSource, "utf8");
};

type LoaderContext = {
  cacheable?: (flag?: boolean) => void;
  resourcePath: string;
};

export default function meowPromptWebpackLoader(this: LoaderContext, source: string): string {
  this.cacheable?.(true);

  const compiledModule = compilePromptModule(source, {
    resourcePath: this.resourcePath,
    runtimeModulePath,
  });

  writeDeclarationIfChanged(this.resourcePath, compiledModule.dts);

  return compiledModule.code;
}
