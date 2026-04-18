import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { createMeowPromptVitePlugin } from "./packages/meow-prompt/src/vite-plugin";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [createMeowPromptVitePlugin()],
  resolve: {
    alias: {
      "@": rootDirectory,
      codemirror: path.join(rootDirectory, "vendor", "codemirror", "lib", "codemirror.ts"),
      "codemirror/addon/display/placeholder": path.join(
        rootDirectory,
        "vendor",
        "codemirror",
        "addon",
        "display",
        "placeholder.ts",
      ),
      "codemirror/addon/hint/show-hint": path.join(
        rootDirectory,
        "vendor",
        "codemirror",
        "addon",
        "hint",
        "show-hint.ts",
      ),
      "server-only": path.join(rootDirectory, "test-support/server-only.ts"),
      vscode: path.join(rootDirectory, "test-support/vscode.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
});
