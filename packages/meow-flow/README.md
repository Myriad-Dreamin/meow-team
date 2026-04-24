# meow-flow

`meow-flow` installs a team config into a shared local artifact and turns that
config into a deterministic repository/worktree planning result.

## Shared config install

Install a JavaScript or TypeScript team config before running planning commands:

```bash
pnpm run cli:meow-flow -- config install ./team.config.ts
pnpm run cli:meow-flow -- config install ./team.config.js
```

The install command accepts only `.ts` and `.js` source files. It evaluates the
source config in the source project context, normalizes repository paths, and
writes a generated JavaScript artifact to:

```text
~/.local/shared/meow-flow/config.js
```

Treat the shared file as generated runtime state. Do not edit it by hand. Re-run
`meow-flow config install <path>` whenever the source config changes, and also
after moving the source repository because the installed artifact contains
absolute repository paths.

## Config resolution

`meow-flow plan` and `meow-flow thread ls` resolve config in this order:

1. `--config <path>` when provided
2. The installed shared artifact at `~/.local/shared/meow-flow/config.js`

`meow-flow` does not search for a local `team.config.ts` or
`team.config.js` by default. If no shared config has been installed, it fails and
prints the `meow-flow config install <path>` command to run.

When the config uses TypeScript path aliases such as `@/...`, `meow-flow`
looks for the nearest ancestor `tsconfig.json` next to that config and uses it
as the loader context while installing or when loading an explicit `--config`
path. The generated shared JavaScript artifact does not need the original
TypeScript context at plan time.

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
pnpm run cli:meow-flow -- config install ./team.config.ts
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

## Thread workspace listing

Run:

```bash
pnpm run cli:meow-flow -- thread ls
pnpm run cli:meow-flow -- thread ls --config ./team.config.ts
```

`thread ls` must run inside a git repository. It resolves the canonical checkout
root, including from inside linked `.paseo-worktrees/paseo-N` worktrees, then
uses `dispatch.maxConcurrentWorkers` as the configured slot range. Each line
shows a slot path relative to the canonical root and whether that slot is a
registered Git worktree:

```text
.paseo-worktrees/paseo-1 idle
.paseo-worktrees/paseo-2 not-created (folder is not allocated)
```

The status domain includes `idle`, `occupied`, and `not-created`, but this
initial command only reports `idle` or `not-created`. Occupation detection is
reserved for a later change.
