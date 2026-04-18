import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "**/out/**",
      "build/**",
      "**/dist/**",
      ".pnpm-store/**",
      ".meow-team-worktrees/**",
      ".codex/**",
      "packages/clipanion/**",
      "packages/typanion/**",
      "data/**",
      "docs/.vitepress/**",
    ],
  },
];

export default config;
