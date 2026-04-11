import { fileURLToPath } from "node:url";
import { compilePromptModule, isPromptTemplatePath } from "./compiler";

const runtimeModulePath = fileURLToPath(new URL("./runtime", import.meta.url));

export const createMeowPromptVitePlugin = () => {
  return {
    enforce: "pre" as const,
    name: "meow-prompt",
    transform(source: string, id: string) {
      if (!isPromptTemplatePath(id)) {
        return null;
      }

      const compiledModule = compilePromptModule(source, {
        resourcePath: id,
        runtimeModulePath,
      });

      return {
        code: compiledModule.code,
        map: null,
      };
    },
  };
};
