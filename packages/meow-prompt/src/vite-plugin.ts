import path from "node:path";
import type { InlineConfig, Plugin } from "vite";
import { isPromptTemplatePath, normalizePromptTemplatePath } from "./compiler";
import {
  createPromptTemplateBootstrapModule,
  removePromptTemplateDeclaration,
  writePromptTemplateDeclaration,
} from "./declaration-sync";

export const meowPromptBootstrapModuleId = "virtual:meow-prompt/bootstrap";

const resolvedMeowPromptBootstrapModuleId = `\0${meowPromptBootstrapModuleId}`;

export const createMeowPromptViteSyncConfig = (rootDirectory: string): InlineConfig => {
  return {
    appType: "custom",
    build: {
      emptyOutDir: false,
      outDir: path.join(rootDirectory, ".meow-prompt-vite-sync"),
      rollupOptions: {
        input: meowPromptBootstrapModuleId,
      },
      write: false,
    },
    cacheDir: path.join(rootDirectory, ".meow-prompt-vite-cache"),
    logLevel: "silent",
    plugins: [createMeowPromptVitePlugin()],
    root: rootDirectory,
  };
};

export const createMeowPromptVitePlugin = (): Plugin => {
  return {
    enforce: "pre" as const,
    name: "meow-prompt",
    load(id) {
      if (id !== resolvedMeowPromptBootstrapModuleId) {
        return null;
      }

      return createPromptTemplateBootstrapModule();
    },
    resolveId(id) {
      if (id !== meowPromptBootstrapModuleId) {
        return null;
      }

      return resolvedMeowPromptBootstrapModuleId;
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
