## Why

Teams using Meow Flow work in fixed Paseo worktree slots, but there is no quick command to see which slots currently exist for the repository they are in. A `meow-flow thread ls` command gives operators an inspectable view of the configured thread/worktree lanes before thread occupation tracking is implemented.

## What Changes

- Add a `meow-flow thread ls` command that runs from inside a git-managed folder.
- Resolve the canonical repository root from Git metadata, including when the current directory is itself a linked worktree under `.paseo-worktrees/paseo-N`.
- Enumerate configured slot numbers from `1..N`, where `N` comes from Meow Flow config.
- Report each expected `.paseo-worktrees/paseo-N` path as `idle` when the git worktree exists and `not-created (folder is not allocated)` when it does not.
- Model the workspace status set as `idle`, `occupied`, and `not-created`, but keep `occupied` unreachable in this PR because thread occupation detection is intentionally deferred.
- Update CLI help, README, and targeted tests for the new command.

## Capabilities

### New Capabilities

- `thread-workspace-listing`: List configured Meow Flow thread worktree slots for the current git repository.

### Modified Capabilities

None.

## Impact

- `packages/meow-flow` command tree, Git root/worktree discovery, output formatting, and CLI tests.
- `packages/meow-flow-core` types/helpers if the implementation chooses to keep slot derivation pure and reusable.
- `packages/meow-flow/README.md` command documentation.
- No daemon, WebSocket, mobile-app, or agent-occupation behavior changes.
