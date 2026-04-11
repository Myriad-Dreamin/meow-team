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
      "server-only": path.join(rootDirectory, "test-support/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
});
