## 1. Dependency and Storage Setup

- [x] 1.1 Add `better-sqlite3` to `packages/meow-flow` runtime dependencies and add TypeScript declarations if needed.
- [x] 1.2 Add `better-sqlite3` to the root pnpm build-dependency allowlist and refresh `pnpm-lock.yaml` with `pnpm install`.
- [x] 1.3 Add a shared Meow Flow database path helper for `~/.local/shared/meow-flow/meow-flow.sqlite`, testable with overridden home directories.
- [x] 1.4 Implement an idempotent SQLite migration for the `thread_occupations` table, request-body storage, and one-to-one running-occupation uniqueness constraints.

## 2. Occupation Domain Logic

- [x] 2.1 Extract reusable root, slot, and registered-worktree discovery from the current `thread ls` implementation.
- [x] 2.2 Implement storage helpers to read occupations by repository, read an occupation by thread id, and insert a running allocation atomically.
- [x] 2.3 Implement allocation logic that rejects existing running thread ids, rejects another-repository thread id allocations, and selects the lowest idle registered slot.
- [x] 2.4 Ensure stale occupations for unregistered worktrees do not make a slot appear usable or occupied in list output.
- [x] 2.5 Release a newly inserted occupation when the subsequent Paseo agent launch fails.
- [x] 2.6 Generate a random UUID thread id when `meow-flow run` is called without `--id`.
- [x] 2.7 Implement transactional delete helpers that validate all requested thread ids before removing any occupations.

## 3. CLI Commands and Output

- [x] 3.1 Add `meow-flow run [--id <id>] "request body"` with explicit/shared config loading, canonical root detection, allocation persistence, and clear no-idle-workspace diagnostics.
- [x] 3.2 Invoke `paseo run --cwd <allocated-workspace> --label x-meow-flow-id=<resolved-id> "<request body>"` from `meow-flow run`, passing the request body through unchanged.
- [x] 3.3 Ensure an already-running thread id or concurrently occupied selected workspace fails without launching a duplicate Paseo agent.
- [x] 3.4 Extend `meow-flow thread ls` to include persisted occupations and print occupied rows as `<relative-path> <thread-id>`.
- [x] 3.5 Add `meow-flow ls` as a top-level alias that reuses the same handler and options as `meow-flow thread ls`.
- [x] 3.6 Add `meow-flow delete <id1> <id2> ...` with repository-independent SQLite lookup, all-or-nothing deletion, and released-workspace output.
- [x] 3.7 Update `packages/meow-flow/README.md` and CLI help expectations for `run`, `delete`, `thread ls`, and the `ls` alias.

## 4. Verification

- [x] 4.1 Add targeted CLI tests for explicit-id allocation, generated-id allocation, existing-id rejection, another-repository rejection, no-idle failure, and persisted list output.
- [x] 4.2 Add targeted CLI tests for `paseo run` invocation arguments, request-body pass-through, duplicate-launch prevention, selected-workspace occupation failure, and failed-launch occupation rollback.
- [x] 4.3 Add targeted CLI tests for `meow-flow delete` single-id release, multi-id release, missing-id all-or-nothing failure, and post-delete idle listing.
- [x] 4.4 Add targeted CLI tests for `meow-flow ls` alias behavior and stale occupation handling.
- [x] 4.5 Run the changed `meow-flow` test file(s) only with `npx vitest run <file> --bail=1`.
- [x] 4.6 Run `npm run format` and `npm run typecheck` after implementation.
