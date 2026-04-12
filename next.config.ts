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
    root: rootDirectory,
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
  webpack(config) {
    config.module.rules.push({
      test: /\.(prompt|template)\.md$/,
      use: [
        {
          loader: meowPromptLoader,
        },
      ],
    });

    return config;
  },
};

export default nextConfig;
