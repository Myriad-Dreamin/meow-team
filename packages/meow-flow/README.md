# MeowFlow

`mfl` is the MeowFlow CLI shortcut. It installs MeowFlow skills, manages linked
Git worktrees, launches staged Paseo agents, and stores thread metadata and
handoffs.

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
/meow-flow Create a echo hello script.
```

`/meow-flow` and `/mfl` are the entry skills. They run `mfl status`, launch the
initial plan stage when the current worktree is idle, and coordinate later
stages through thread status and handoffs.

Thread state is persisted in the shared SQLite database at
`~/.local/shared/meow-flow/meow-flow.sqlite`, so all linked worktrees for the
same machine see the same occupations, agents, and handoffs.

## Worktrees

```bash
mfl worktree new
mfl worktree new --branch auth-flow
mfl worktree ls
mfl worktree list
mfl worktree rm paseo-1
mfl worktree remove paseo-1
```

`mfl worktree new` creates a linked Git worktree at
`.paseo-workspaces/paseo-{N+1}`, where `N` is the largest existing `paseo-N`
worktree discovered from `git worktree list --porcelain`. If `--branch` is not
provided, MeowFlow creates a random branch name.

Worktrees created manually with `git worktree add` are also discovered by
MeowFlow and can be used by `mfl run`.

## Run

```bash
mfl run --stage plan "implement user authentication"
mfl run --id auth-flow --stage plan "implement user authentication and add tests"
mfl run --stage code "implement the approved plan"
mfl run --stage review
```

For a new thread with no agents, `plan` is the default stage. After a thread
has agents, pass `--stage plan|code|review|execute|validate`.

The resolved thread id is sent to Paseo as a label:

```text
x-meow-flow-id=<thread-id>
```

`mfl run` prints:

```text
agent-id: <id>
next-seq: <seq>
```

Use `next-seq` to read only handoffs created after the new stage agent was
launched.

## Status, Thread, Agent, And Handoff Commands

```bash
mfl status
mfl thread status <id> --no-color
mfl thread set name install-auth-flow
mfl agent update-self
mfl handoff append --stage code "implemented auth form; tests passed"
mfl handoff get -n 5
mfl handoff get --since 3
mfl thread archive
```

`mfl thread archive` marks the current thread archived and releases the linked
worktree occupation. It does not delete the worktree folder and does not revert
code changes.

## Archive And Delete Skills

```text
/meow-archive
/meow-archive delete
/mfl archive
/mfl delete
```

Normal archive archives the OpenSpec proposal when present and then runs
`mfl thread archive`. Delete removes the open proposal artifacts without
reverting code changes, then archives the thread.

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
