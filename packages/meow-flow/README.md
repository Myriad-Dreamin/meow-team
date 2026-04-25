# MeowFlow

`mfl` is the MeowFlow CLI shortcut. It starts Paseo agents in git worktrees
without a MeowFlow config file.

## Installation

MeowFlow currently targets the modified Paseo source in this repository. From
the repository root, build the local Paseo packages before running `mfl`:

```bash
pnpm install --frozen-lockfile
pnpm run build:daemon
```

See `docs/DEVELOPMENT.md` for the source CLI and build sync notes. In this
checkout, use the workspace scripts:

```bash
pnpm run cli -- ls
pnpm run cli:mfl -- worktree ls
```

The published package will use the modified Paseo package once that is published
separately.

## Get Started

```text
pnpm run cli:mfl -- worktree new
pnpm run cli:mfl -- run "Create a echo hello script."
// You'll see the agent started in the paseo's webapp
```

Once the package is installed on `PATH`, the run command is:
`mfl run "Create a echo hello script."`.

`mfl run` passes the request body through to Paseo unchanged and launches the
agent in a linked git worktree. When no linked worktree is available, it tells
you to run `mfl worktree new`.

## Worktrees

```bash
mfl worktree new
mfl worktree new --branch auth-flow
mfl worktree ls
mfl worktree list
mfl worktree rm paseo-1
mfl worktree remove paseo-1
```

`mfl worktree new` creates a linked git worktree at
`.paseo-workspaces/paseo-{N+1}`, where `N` is the largest existing `paseo-N`
worktree discovered from `git worktree list --porcelain`. If `--branch` is not
provided, MeowFlow creates a random branch name.

Worktrees created manually with `git worktree add` are also discovered by
MeowFlow and can be used by `mfl run`.

## Run

```bash
mfl run "implement user authentication"
mfl run --id auth-flow "implement user authentication and add tests"
```

When `--id` is omitted, `mfl` generates a UUID and uses it as the MeowFlow
thread id. The resolved id is sent to Paseo as a label:

```text
x-meow-flow-id=<thread-id>
```

The command does not install, read, or require a MeowFlow config file.
