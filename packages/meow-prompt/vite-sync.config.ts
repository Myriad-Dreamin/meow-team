import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { createMeowPromptViteSyncConfig } from "./src/vite-plugin";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = process.env.MEOW_PROMPT_VITE_ROOT ?? path.resolve(packageRoot, "..", "..");

export default defineConfig(createMeowPromptViteSyncConfig(rootDirectory));
