## Context

`meow-flow` currently loads explicit or installed shared team config and exposes `plan` to print normalized repository candidates plus worktree allocation descriptors. The current repository layout uses linked worktrees under a canonical checkout root, for example `/repo/.paseo-worktrees/paseo-1`, while `git rev-parse --show-toplevel` inside a linked worktree returns that linked worktree path instead of the canonical checkout root. `thread ls` therefore needs Git common-directory awareness rather than a simple current-worktree root lookup.

The requested PR should not add thread occupation detection. It should only classify configured slots as present or missing, leaving the `occupied` state available for the next PR.

## Goals / Non-Goals

**Goals:**

- Add `meow-flow thread ls` with the sample human output shape.
- Resolve the canonical checkout root from any directory inside the primary checkout or one of its linked worktrees.
- Use the existing config loading rules and `dispatch.maxConcurrentWorkers` as the configured max slot number.
- Detect expected `.paseo-worktrees/paseo-N` paths and classify them as `idle` or `not-created`.
- Define the status domain as `idle`, `occupied`, and `not-created` without implementing occupation lookup.

**Non-Goals:**

- No logic to bind a running thread, branch, agent, or task id to a worktree slot.
- No creation, deletion, repair, or pruning of worktree folders.
- No daemon or mobile API changes.
- No broad changes to existing `plan` output or shared config install semantics.

## Decisions

### 1. Add a `thread` command group with `ls`

Implement `createThreadCommand()` in `packages/meow-flow` and register it from `createCli()`. This keeps future thread subcommands grouped without overloading `plan`.

Alternative considered: add a flat `thread-ls` command. That is simpler but does not match the requested `meow-flow thread ls` shape and makes future thread commands less discoverable.

### 2. Reuse existing config resolution and require `dispatch.maxConcurrentWorkers`

`thread ls` should accept `--config <path>` with the same semantics as `plan`; otherwise it should use the installed shared config. The command should fail clearly when `dispatch.maxConcurrentWorkers` is absent because the requested slot range is `1..N` and `N` is configured by config.

Alternative considered: infer `N` from existing `.paseo-worktrees/paseo-*` directories. That would hide missing future slots and conflicts with the requirement that max `N` is config-driven.

### 3. Resolve canonical root from Git common directory

Use Git commands rather than path heuristics:

- Confirm the command is run inside a work tree with `git rev-parse --is-inside-work-tree`.
- Read `git rev-parse --git-common-dir`.
- Resolve the common dir path relative to the current working directory when Git returns a relative path.
- Treat the parent of the common `.git` directory as the canonical repository root.

For a normal checkout, `.git` is under the repository root. For a linked worktree, the common dir points back to the primary checkout's `.git`, which gives the root where `.paseo-worktrees` lives.

Alternative considered: use `git worktree list` and choose the first path. That is useful for validation but less direct than the common-dir relationship and can be harder to reason about if Git output ordering changes.

### 4. Use registered Git worktrees for slot existence

The command should parse `git worktree list --porcelain` and consider `.paseo-worktrees/paseo-N` existing only when that exact absolute path is registered as a Git worktree. Missing or unregistered paths should be displayed as `not-created (folder is not allocated)`.

Alternative considered: `fs.existsSync` on the folder. That can misclassify stale directories, partial failed checkouts, or non-worktree folders as usable lanes.

### 5. Keep initial output intentionally unpretty

The first human output should be a plain line per slot:

```text
.paseo-worktrees/paseo-1 idle
.paseo-worktrees/paseo-2 not-created (folder is not allocated)
```

Use paths relative to the canonical root so output is stable across machines and matches the requested sample. A future `--json` output can be added once occupation metadata exists, but it is not required for this PR.

## Risks / Trade-offs

- [Config missing `dispatch.maxConcurrentWorkers`] -> Fail with an actionable message instead of guessing a slot count.
- [Stale folder exists but is not a registered Git worktree] -> Report `not-created`; this is conservative and avoids treating unusable folders as idle lanes.
- [Repository config contains several repositories] -> This command is anchored to the Git repository containing the current directory; config is only needed for max slot count in this PR.
- [Future occupied output may need more metadata] -> Keep status as a string union and isolate formatting so the next PR can replace `idle` with an occupation label without changing root/slot discovery.
