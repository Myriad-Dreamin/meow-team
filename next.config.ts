import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const meowPromptWebpackLoader = path.join(
  rootDirectory,
  "packages",
  "meow-prompt",
  "webpack-loader.cjs",
);

const nextConfig: NextConfig = {
  turbopack: {
    root: rootDirectory,
    rules: {
      "*.prompt.md": {
        loaders: [meowPromptWebpackLoader],
        as: "*.js",
      },
      "*.template.md": {
        loaders: [meowPromptWebpackLoader],
        as: "*.js",
      },
    },
  },
  webpack(config) {
    config.module.rules.push({
      test: /\.(prompt|template)\.md$/,
      type: "javascript/auto",
      use: [
        {
          loader: meowPromptWebpackLoader,
        },
      ],
    });

    return config;
  },
};

export default nextConfig;
