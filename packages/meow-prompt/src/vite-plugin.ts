import { isPromptTemplatePath, normalizePromptTemplatePath } from "./compiler";
import {
  removePromptTemplateDeclaration,
  syncPromptTemplateDeclarations,
  writePromptTemplateDeclaration,
} from "./declaration-sync";

export const createMeowPromptVitePlugin = () => {
  let rootDirectory = process.cwd();

  return {
    enforce: "pre" as const,
    name: "meow-prompt",
    configResolved(config: { root: string }) {
      rootDirectory = config.root;
    },
    async buildStart() {
      await syncPromptTemplateDeclarations({ rootDirectory });
    },
    async transform(source: string, id: string) {
      const resourcePath = normalizePromptTemplatePath(id);

      if (!isPromptTemplatePath(resourcePath)) {
        return null;
      }

      const compiledModule = await writePromptTemplateDeclaration(source, resourcePath);

      return {
        code: compiledModule.code,
        map: null,
      };
    },
    async watchChange(id: string, change: { event: string }) {
      const resourcePath = normalizePromptTemplatePath(id);

      if (!isPromptTemplatePath(resourcePath) || change.event !== "delete") {
        return;
      }

      await removePromptTemplateDeclaration(resourcePath);
    },
  };
};
