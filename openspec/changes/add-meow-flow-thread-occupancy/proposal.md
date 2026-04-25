## Why

`meow-flow thread ls` can show which fixed Paseo worktree slots exist, but it cannot yet tell which thread owns a slot or reserve an idle slot for a new thread. Operators need a durable local allocation store so `meow-flow run` can choose a workspace deterministically and later list commands can report real `occupied` state.

## What Changes

- Add `meow-flow run [--id <id>] "request body"` as the first thread allocation and agent-launch command.
- Generate a random UUID thread id when `--id` is omitted, and use the resolved id for storage, listing, and labels.
- Persist thread-to-workspace occupations in `~/.local/shared/meow-flow/meow-flow.sqlite` using `better-sqlite3`.
- Enforce one-to-one running allocation: a thread can run in only one workspace, and a workspace can run only one thread.
- Launch a Paseo agent for the allocated workspace by invoking `paseo run` with `--label x-meow-flow-id=<thread-id>` and the allocated workspace as its cwd.
- Pass the request body through to `paseo run` unchanged; initial usage can be as simple as asking the agent to echo `"hello world"`.
- Fail instead of launching when the selected workspace already has a running Meow Flow thread.
- Extend `meow-flow thread ls` to read the SQLite allocation store and emit `idle`, `occupied`, or `not-created` for configured `.paseo-worktrees/paseo-N` slots.
- Add `meow-flow ls` as a top-level alias for `meow-flow thread ls`.
- Keep slot discovery rooted in the current git-managed folder, with `dispatch.maxConcurrentWorkers` defining the maximum `N`.
- Update package dependencies, lockfile/workspace metadata, command help, README, and targeted tests.

## Capabilities

### New Capabilities

- `thread-workspace-occupancy`: Allocate fixed Paseo worktree slots to Meow Flow thread ids, launch a labeled Paseo agent for a request body, and persist running occupations locally.

### Modified Capabilities

- `thread-workspace-listing`: Report persisted `occupied` state and support the top-level `meow-flow ls` alias.

## Impact

- `packages/meow-flow` command tree, thread listing/allocation/agent-launch logic, SQLite storage module, README, and CLI tests.
- `packages/meow-flow/package.json`, root `package.json` pnpm build-dependency allowlist, and `pnpm-lock.yaml` for `better-sqlite3`.
- Uses the existing `paseo run` CLI surface; no Paseo daemon, WebSocket, mobile-app, or message-schema changes.
