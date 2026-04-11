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
      "build/**",
      ".pnpm-store/**",
      ".meow-team-worktrees/**",
      ".codex/**",
      "data/**",
      "docs/.vitepress/**",
    ],
  },
];

export default config;
