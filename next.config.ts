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
  webpack(config) {
    config.module.rules.push({
      test: /\.(prompt|template)\.md$/,
      type: "javascript/auto",
      use: [meowPromptWebpackLoader],
    });

    return config;
  },
};

export default nextConfig;
