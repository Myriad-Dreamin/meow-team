import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const meowPromptLoader = path.join(
  rootDirectory,
  "packages",
  "meow-prompt",
  "turbopack-loader.cjs",
);

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.prompt.md": {
        loaders: [meowPromptLoader],
        as: "*.js",
      },
      "*.template.md": {
        loaders: [meowPromptLoader],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
