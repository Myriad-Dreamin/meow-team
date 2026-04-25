## 1. Dependency and Storage Setup

- [ ] 1.1 Add `better-sqlite3` to `packages/meow-flow` runtime dependencies and add TypeScript declarations if needed.
- [ ] 1.2 Add `better-sqlite3` to the root pnpm build-dependency allowlist and refresh `pnpm-lock.yaml` with `pnpm install`.
- [ ] 1.3 Add a shared Meow Flow database path helper for `~/.local/shared/meow-flow/meow-flow.sqlite`, testable with overridden home directories.
- [ ] 1.4 Implement an idempotent SQLite migration for the `thread_occupations` table, request-body storage, and one-to-one running-occupation uniqueness constraints.

## 2. Occupation Domain Logic

- [ ] 2.1 Extract reusable root, slot, and registered-worktree discovery from the current `thread ls` implementation.
- [ ] 2.2 Implement storage helpers to read occupations by repository, read an occupation by thread id, and insert a running allocation atomically.
- [ ] 2.3 Implement allocation logic that rejects existing running thread ids, rejects another-repository thread id allocations, and selects the lowest idle registered slot.
- [ ] 2.4 Ensure stale occupations for unregistered worktrees do not make a slot appear usable or occupied in list output.
- [ ] 2.5 Release a newly inserted occupation when the subsequent Paseo agent launch fails.
- [ ] 2.6 Generate a random UUID thread id when `meow-flow run` is called without `--id`.

## 3. CLI Commands and Output

- [ ] 3.1 Add `meow-flow run [--id <id>] "request body"` with explicit/shared config loading, canonical root detection, allocation persistence, and clear no-idle-workspace diagnostics.
- [ ] 3.2 Invoke `paseo run --cwd <allocated-workspace> --label x-meow-flow-id=<resolved-id> "<request body>"` from `meow-flow run`, passing the request body through unchanged.
- [ ] 3.3 Ensure an already-running thread id or concurrently occupied selected workspace fails without launching a duplicate Paseo agent.
- [ ] 3.4 Extend `meow-flow thread ls` to include persisted occupations and print occupied rows as `<relative-path> <thread-id>`.
- [ ] 3.5 Add `meow-flow ls` as a top-level alias that reuses the same handler and options as `meow-flow thread ls`.
- [ ] 3.6 Update `packages/meow-flow/README.md` and CLI help expectations for `run`, `thread ls`, and the `ls` alias.

## 4. Verification

- [ ] 4.1 Add targeted CLI tests for explicit-id allocation, generated-id allocation, existing-id rejection, another-repository rejection, no-idle failure, and persisted list output.
- [ ] 4.2 Add targeted CLI tests for `paseo run` invocation arguments, request-body pass-through, duplicate-launch prevention, selected-workspace occupation failure, and failed-launch occupation rollback.
- [ ] 4.3 Add targeted CLI tests for `meow-flow ls` alias behavior and stale occupation handling.
- [ ] 4.4 Run the changed `meow-flow` test file(s) only with `npx vitest run <file> --bail=1`.
- [ ] 4.5 Run `npm run format` and `npm run typecheck` after implementation.
