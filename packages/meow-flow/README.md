# Meow Flow

`mfl` is the Meow Flow CLI shortcut. It installs a team config into a shared
local artifact and turns that config into a deterministic repository/worktree
planning result.

## Shared config install

Install a JavaScript or TypeScript team config before running planning commands:

```bash
pnpm run cli:mfl -- config install ./team.config.ts
pnpm run cli:mfl -- config install ./team.config.js
```

The install command accepts only `.ts` and `.js` source files. It evaluates the
source config in the source project context, normalizes repository paths, and
writes a generated JavaScript artifact to:

```text
~/.local/shared/meow-flow/config.js
```

Treat the shared file as generated runtime state. Do not edit it by hand. Re-run
`mfl config install <path>` whenever the source config changes, and also
after moving the source repository because the installed artifact contains
absolute repository paths.

## Config resolution

`mfl plan`, `mfl run`, `mfl thread ls`, and `mfl ls` resolve config in this
order:

1. `--config <path>` when provided
2. The installed shared artifact at `~/.local/shared/meow-flow/config.js`

`mfl` does not search for a local `team.config.ts` or `team.config.js` by
default. If no shared config has been installed, it fails and prints the
`mfl config install <path>` command to run.

When the config uses TypeScript path aliases such as `@/...`, `mfl` looks for
the nearest ancestor `tsconfig.json` next to that config and uses it as the
loader context while installing or when loading an explicit `--config` path. The
generated shared JavaScript artifact does not need the original TypeScript
context at plan time.

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
pnpm run cli:mfl -- config install ./team.config.ts
pnpm run cli:mfl -- plan
pnpm run cli:mfl -- plan --json
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
pnpm run cli:mfl -- thread ls
pnpm run cli:mfl -- thread ls --config ./team.config.ts
pnpm run cli:mfl -- ls
```

`thread ls` and the top-level `ls` alias must run inside a git repository. They
resolve the canonical checkout root, including from inside linked
`.paseo-worktrees/paseo-N` worktrees, then use
`dispatch.maxConcurrentWorkers` as the configured slot range. Each line shows a
slot path relative to the canonical root and whether that slot is idle,
occupied, or not created:

```text
.paseo-worktrees/paseo-1 idle
.paseo-worktrees/paseo-2 fix-test-ci
.paseo-worktrees/paseo-3 not-created (folder is not allocated)
```

Occupied rows print the occupying thread id in the status position.

## Thread workspace occupancy

Run:

```bash
pnpm run cli:mfl -- run --id fix-test-ci 'echo "hello world"'
pnpm run cli:mfl -- run 'echo "hello world"'
pnpm run cli:mfl -- delete fix-test-ci
```

`run` must run inside a git repository. It resolves the canonical checkout root,
loads the explicit or shared config, selects the lowest idle registered
`.paseo-worktrees/paseo-N` slot, persists the occupation, and launches Paseo:

```text
paseo run --cwd <absolute-workspace-path> --label x-meow-flow-id=<thread-id> '<request body>'
```

When `--id` is omitted, `run` generates a random UUID and prints it after the
Paseo launch succeeds. The request body is passed to `paseo run` unchanged.

Running occupations are stored in:

```text
~/.local/shared/meow-flow/meow-flow.sqlite
```

The store enforces one running workspace per thread id and one running thread
per workspace. If `paseo run` fails after a workspace is reserved, `mfl`
releases the fresh occupation before returning the failure.

`delete <id1> <id2> ...` releases persisted Meow Flow occupations by thread id
from the shared SQLite database. It does not need to run inside a git
repository. Batch deletes validate every requested id before deleting any rows,
then print each released thread id and workspace path. This command does not
remove the `.paseo-worktrees/paseo-N` folder and does not stop or delete a Paseo
agent.
