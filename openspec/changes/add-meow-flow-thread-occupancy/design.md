## Context

`meow-flow thread ls` already resolves the canonical Git checkout root, reads `dispatch.maxConcurrentWorkers`, detects registered `.paseo-worktrees/paseo-N` Git worktrees, and prints `idle` or `not-created`. The previous change intentionally left `occupied` unreachable.

This change makes occupancy real. The CLI needs a local, durable store outside any single repository checkout so different `meow-flow` invocations can agree that a thread id owns one workspace. The requested store path is `~/.local/shared/meow-flow/meow-flow.sqlite`, and the requested SQLite driver is `better-sqlite3`.

## Goals / Non-Goals

**Goals:**

- Add `meow-flow run [--id <id>] "request body"` to allocate a thread id to an existing idle `.paseo-worktrees/paseo-N` workspace.
- Generate a random UUID thread id when `--id` is omitted.
- Launch a Paseo agent for the allocated workspace from the same command using the existing `paseo run` CLI.
- Persist running occupations in the shared SQLite database and enforce one-to-one thread/workspace ownership.
- Extend `meow-flow thread ls` to show persisted occupations while preserving existing root, slot-count, and `not-created` behavior.
- Add `meow-flow ls` as a top-level alias for `meow-flow thread ls`.
- Update pnpm metadata so `better-sqlite3` installs and builds correctly in the workspace.

**Non-Goals:**

- No creation, deletion, repair, or pruning of `.paseo-worktrees/paseo-N` folders.
- No design for prompt composition, planner handoff, provider/model selection, or worker instructions beyond passing the request body through unchanged.
- No direct daemon API integration beyond invoking the existing `paseo run` command.
- No WebSocket, mobile app, or Paseo daemon schema changes.
- No release of a multi-user lock service; this is local CLI state.

## Decisions

### 1. Store allocations in a small SQLite table keyed by thread and workspace

Create a storage module in `packages/meow-flow` that opens `~/.local/shared/meow-flow/meow-flow.sqlite`, creates the parent directory, and applies an idempotent schema migration. A minimal table is enough:

```sql
CREATE TABLE IF NOT EXISTS thread_occupations (
  thread_id TEXT PRIMARY KEY,
  repository_root TEXT NOT NULL,
  slot_number INTEGER NOT NULL,
  workspace_relative_path TEXT NOT NULL,
  request_body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(repository_root, slot_number)
);
```

The primary key enforces one workspace per thread id. The unique `(repository_root, slot_number)` constraint enforces one running thread per workspace. `repository_root` should be the canonical Git root already used by `thread ls`, and `workspace_relative_path` should remain `.paseo-worktrees/paseo-N` for stable output. For this slice, an occupation row is the running-thread signal; completion/release mechanics can be added by a later command.

Alternative considered: a JSON file under the same shared directory. SQLite gives atomic writes, unique constraints, and a direct path to future allocation queries without inventing file locking.

### 2. Resolve thread id from `--id` or `crypto.randomUUID()`

`run` should accept exactly one positional request body and an optional `--id <id>`. If the id is omitted, generate a UUID with `crypto.randomUUID()`. The resolved id should be persisted in SQLite, printed in command output, used in `thread ls`, and passed to Paseo as `--label x-meow-flow-id=<id>`.

If the requested or generated id already has a running occupation, `run` should fail clearly and should not launch a second agent. This keeps `run` as a start operation rather than a resume/idempotent lookup operation.

Alternative considered: keep the id as a required positional argument. That leaves no natural place for the request body and makes the common case more verbose.

### 3. Allocate only existing registered worktrees and choose the lowest idle slot

`run` should reuse the same root and registered-worktree detection as `thread ls`. It should inspect configured slots `1..dispatch.maxConcurrentWorkers`, skip `not-created` slots, skip registered slots with a running occupation, and pick the lowest-numbered idle registered slot. If no idle registered slot exists, it should fail clearly instead of creating a worktree. If a concurrent invocation occupies the selected workspace before insertion, the SQLite uniqueness failure should be surfaced as "a thread is already running in that workspace" and no agent should be launched.

Alternative considered: create missing `.paseo-worktrees/paseo-N` folders on demand. The user asked for detection and occupancy, and worktree creation has more branch/base/ref behavior than this change needs.

### 4. Treat listing status as semantic state, but print the thread id for occupied rows

Internally each row should classify as `idle`, `occupied`, or `not-created`. For human output, keep the unpretty line format from the request:

```text
.paseo-worktrees/paseo-1 idle
.paseo-worktrees/paseo-2 fix-test-ci
.paseo-worktrees/paseo-3 not-created (folder is not allocated)
```

The second row is semantically `occupied`; the printed token is the occupying thread id. This keeps the output compact while preserving an explicit status domain in code and tests.

Alternative considered: print `.paseo-worktrees/paseo-2 occupied fix-test-ci`. That is more explicit but does not match the requested sample output.

### 5. Launch a labeled Paseo agent after reserving a workspace

After `run` reserves a workspace, it should invoke the existing Paseo CLI with the allocated workspace as cwd, a Meow Flow label, and the raw request body:

```text
paseo run --cwd <absolute-workspace-path> --label x-meow-flow-id=<thread-id> '<request body>'
```

The request body is intentionally opaque to Meow Flow in this slice. It can be a smoke-test request such as `echo "hello world"`, but Meow Flow should not yet transform it into richer worker instructions. The label key `x-meow-flow-id` gives Paseo and later Meow Flow commands a stable way to find the agent associated with a thread.

If the `paseo run` invocation fails, the command should release the newly reserved occupation so a failed launch does not leave an idle workspace permanently marked occupied. If the selected workspace already has a running occupation, `run` should fail before invoking `paseo run`.

Alternative considered: store the intended task request in Meow Flow config now. That is premature because the request format and worker handoff are not part of this slice.

### 6. Reuse one list implementation for `thread ls` and top-level `ls`

Extract the current list action into a shared command builder or handler and register it as both `meow-flow thread ls` and `meow-flow ls`. Options, diagnostics, config resolution, and output must remain identical.

Alternative considered: make `ls` shell out to the nested command. Reusing the handler is easier to test and avoids inconsistent error formatting.

### 7. Add `better-sqlite3` to the package and pnpm build allowlist

Add `better-sqlite3` as a runtime dependency of `packages/meow-flow` and add `@types/better-sqlite3` if TypeScript needs declarations. Because `better-sqlite3` has native install/build scripts and pnpm blocks unapproved build scripts in this repo, update the root `pnpm.onlyBuiltDependencies` list to include `better-sqlite3`, then refresh `pnpm-lock.yaml` with `pnpm install`.

Alternative considered: use `node:sqlite`. That would avoid a native dependency, but the request explicitly names `better-sqlite3`.

## Risks / Trade-offs

- [Concurrent `run` invocations race for the same idle slot] -> Use SQLite unique constraints and handle constraint failures by re-reading or surfacing an actionable allocation conflict.
- [Stale occupation row references a removed worktree] -> `thread ls` should prefer Git worktree registration for `not-created`; stale occupied rows for missing slots should not make an unusable folder appear occupied.
- [Native dependency install friction] -> Update pnpm workspace metadata and verify install/typecheck as part of implementation.
- [Thread ids collide across repositories] -> Treat thread identifiers as globally unique in the shared database; fail clearly if a thread id is already running elsewhere.
- [Generated UUID needs to be user-visible] -> Print the resolved thread id in `meow-flow run` output so users can correlate it with `meow-flow thread ls`.
- [Agent launch succeeds after allocation but output parsing changes] -> Do not depend on parsing rich `paseo run` output in this slice; rely on the stable label and cwd arguments.
- [Agent launch fails after reserving a slot] -> Release the newly inserted occupation before returning the failure.
- [Future process execution needs more metadata] -> Keep the schema narrow but migration-ready; additional columns can be added later without changing current output.

## Migration Plan

- On first command use, create the shared directory, SQLite file, and `thread_occupations` table.
- Existing users with no database see the same `thread ls` output as before except top-level `ls` is available.
- Rollback is safe at the application level: older code ignores `meow-flow.sqlite`, though it will not report `occupied` state.
