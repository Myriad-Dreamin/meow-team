# meow-flow

`meow-flow` loads a project-local `team.config.ts` file and turns it into a
deterministic repository/worktree planning result.

## `team.config.ts` discovery

`meow-flow plan` resolves config in this order:

1. `--config <path>` when provided
2. The nearest `team.config.ts` found by searching from the current working
   directory toward the filesystem root

When the config uses TypeScript path aliases such as `@/...`, `meow-flow`
looks for the nearest ancestor `tsconfig.json` next to that config and uses it
as the loader context.

## Supported config shape

```ts
export default {
  notifications: {
    target: "browser",
  },
  dispatch: {
    maxConcurrentWorkers: 4,
  },
  repositories: [
    {
      id: "paseo",
      label: "Paseo",
      directory: ".",
      worktreeTheme: "paseo",
    },
    {
      directory: "../website",
      worktreeParentDirectory: ".paseo/worktrees",
    },
  ],
};
```

Notes:

- `notifications.target` supports `"browser"`, `"vscode"`, and `"android"`.
- `dispatch.maxConcurrentWorkers` must be a positive integer when present.
- `repositories` must be a non-empty array.
- A repository entry can be a string directory or an object with explicit
  metadata.
- `directory` resolves relative to the config file location.
- `worktreeParentDirectory`, when set, resolves relative to that repository
  directory.

## Planning output

Run:

```bash
pnpm run cli:meow-flow -- plan
pnpm run cli:meow-flow -- plan --json
```

The human-readable output shows the resolved config path, repository candidate
order, and worktree allocation metadata.

The `--json` form is stable and includes:

- the resolved config path
- the `tsconfig.json` path used for alias-aware loading, when one was found
- normalized repository candidates in config order
- deterministic worktree allocation descriptors for each repository
