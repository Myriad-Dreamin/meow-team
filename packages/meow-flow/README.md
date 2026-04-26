# MeowFlow

`mfl` is the MeowFlow CLI shortcut. It starts Paseo agents in git worktrees
without a MeowFlow config file.

## Installation

Install `mfl` with one of these options:

1. From npm:

   ```bash
   npm install -g meow-flow
   ```

2. From this checkout with `pnpm link`:

   ```bash
   pnpm --filter meow-flow run build
   cd packages/meow-flow
   pnpm link --global
   ```

MeowFlow currently targets modified Paseo source that is not included in
prebuilt Paseo releases. See
[Paseo installation](../../docs/PASEO-INSTALLATION.md) for the source checkout
steps and upstream citation.

## Get Started

```text
mfl install-skills codex claude
mfl worktree new
mfl run "Create a echo hello script."
// You'll see the agent started in the paseo's webapp
```

`mfl run` launches a Paseo agent in a linked git worktree and passes the request
through unchanged.

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

## Skills

```bash
mfl install-skills
mfl install-skills --list
mfl install-skills codex
mfl install-skills codex claude opencode
```

`mfl install-skills` lists the embedded `meow-*` skills that MeowFlow can
install. Pass one or more providers to install those bundled skill files into
the requested provider skill directories.

Use `--list` to force listing without writing files.

Provider targets:

| Provider | Target directory |
|---|---|
| `codex` | `$CODEX_HOME/skills` or `~/.codex/skills` |
| `claude` | `$CLAUDE_CONFIG_DIR/skills` or `~/.claude/skills` |
| `opencode` | `$OPENCODE_CONFIG_DIR/skills` or `~/.config/opencode/skills` |
