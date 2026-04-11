## 1. Proposal Alignment

- [ ] 1.1 Review the approved OpenSpec artifacts for "Introduce SQLite Storage Module" and confirm the canonical request/PR title is `feat(storage): Introduce SQLite Storage Module`
- [ ] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `feat(storage)` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [ ] 2.1 Implement the approved objective: Replace the JSON-backed team thread store with a server-only official `node:sqlite` storage module using handwritten parameterized SQL, preserve existing history behavior and stored data through a pragmatic migration path, document metadata/migrations/security/performance in `docs/storage.md`, and verify schema migration behavior with SQLite tests that use `:memory:`.
- [ ] 2.2 Run validation and capture reviewer findings for "Introduce SQLite Storage Module"
