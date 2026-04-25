## Why

`meow-flow thread ls` can show which fixed Paseo worktree slots exist, but it cannot yet tell which thread owns a slot or reserve an idle slot for a new thread. Operators need a durable local allocation store so `meow-flow run` can choose a workspace deterministically and later list commands can report real `occupied` state.

## What Changes

- Add `meow-flow run <thread>` as the first thread allocation and agent-launch command.
- Persist thread-to-workspace occupations in `~/.local/shared/meow-flow/meow-flow.sqlite` using `better-sqlite3`.
- Enforce one-to-one allocation: a thread can occupy only one workspace, and a workspace can be occupied by only one thread.
- Launch a Paseo agent for the allocated workspace by invoking `paseo run` with `--label x-meow-flow-id=<thread>` and the allocated workspace as its cwd.
- Keep the initial agent request intentionally minimal by sending a fixed placeholder request to echo `"hello world"`.
- Extend `meow-flow thread ls` to read the SQLite allocation store and emit `idle`, `occupied`, or `not-created` for configured `.paseo-worktrees/paseo-N` slots.
- Add `meow-flow ls` as a top-level alias for `meow-flow thread ls`.
- Keep slot discovery rooted in the current git-managed folder, with `dispatch.maxConcurrentWorkers` defining the maximum `N`.
- Update package dependencies, lockfile/workspace metadata, command help, README, and targeted tests.

## Capabilities

### New Capabilities

- `thread-workspace-occupancy`: Allocate fixed Paseo worktree slots to named Meow Flow threads, launch a labeled Paseo agent, and persist those occupations locally.

### Modified Capabilities

- `thread-workspace-listing`: Report persisted `occupied` state and support the top-level `meow-flow ls` alias.

## Impact

- `packages/meow-flow` command tree, thread listing/allocation/agent-launch logic, SQLite storage module, README, and CLI tests.
- `packages/meow-flow/package.json`, root `package.json` pnpm build-dependency allowlist, and `pnpm-lock.yaml` for `better-sqlite3`.
- Uses the existing `paseo run` CLI surface; no Paseo daemon, WebSocket, mobile-app, or message-schema changes.
