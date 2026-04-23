## 1. Command Structure

- [x] 1.1 Add a `thread` command group and `ls` subcommand to `packages/meow-flow`.
- [x] 1.2 Mirror `plan` config resolution by supporting `--config <path>` and loading the installed shared config by default.
- [x] 1.3 Add a clear error path when `dispatch.maxConcurrentWorkers` is not configured.

## 2. Root and Slot Discovery

- [x] 2.1 Implement Git root discovery that resolves the canonical checkout root from both primary checkouts and linked worktrees.
- [x] 2.2 Parse `git worktree list --porcelain` to detect registered `.paseo-worktrees/paseo-N` worktree paths.
- [x] 2.3 Derive slot rows for `1..dispatch.maxConcurrentWorkers` with statuses `idle` or `not-created`.
- [x] 2.4 Keep `occupied` in the status type/domain but leave occupation detection unimplemented.

## 3. Output and Documentation

- [x] 3.1 Format human output as `<relative-path> <status>` with the `not-created (folder is not allocated)` detail.
- [x] 3.2 Update `packages/meow-flow/README.md` and root CLI help expectations to mention `thread ls`.

## 4. Verification

- [x] 4.1 Add targeted tests for primary-checkout root detection, linked-worktree root detection, configured max slot count, missing max diagnostics, and idle/not-created output.
- [x] 4.2 Run the targeted `meow-flow` test file(s) only, following repo guidance.
- [x] 4.3 Run `npm run typecheck`.
