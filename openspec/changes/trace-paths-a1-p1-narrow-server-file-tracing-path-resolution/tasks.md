## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Narrow server file tracing path resolution" and confirm the canonical request/PR title is `fix: narrow server file tracing paths`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `fix` stays separate from `branchPrefix` and change paths

## 2. Config Path Normalization

- [x] 2.1 Normalize `storage.threadFile` and configured repository root directories at the config boundary so relative inputs are resolved once while absolute paths and SQLite `:memory:` behavior remain intact.
- [x] 2.2 Update downstream types or call sites as needed so traced server modules treat config-owned filesystem values as already resolved inputs.

## 3. Traced Helper Narrowing

- [x] 3.1 Remove helper-level `process.cwd()` joins from `lib/storage/sqlite.ts` and `lib/team/logs.ts` while preserving the existing `.sqlite`, `.json`, and `codex-logs` sibling path behavior.
- [x] 3.2 Update `lib/team/repositories.ts` to consume normalized repository roots without dynamic project-root resolution during repository discovery.
- [x] 3.3 Rewrite OpenSpec archive path assembly in `lib/git/ops.ts` to use explicit bounded source and archive segments while preserving existing archive reuse, conflict detection, and retry semantics.

## 4. Regression Coverage And Validation

- [x] 4.1 Extend config, storage, log, repository, and OpenSpec archive tests to lock in relative-config compatibility and the narrowed path-resolution contract.
- [x] 4.2 Run `pnpm fmt`, `pnpm lint`, the relevant Vitest coverage, and `pnpm build` to confirm the file-tracing warnings are resolved without regressions.
