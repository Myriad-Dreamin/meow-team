## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Refactor team execution storage modules" and confirm the canonical request/PR title is `refactor(team/storage): Refactor team execution storage modules`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `refactor(team/storage)` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [x] 2.1 Implement the approved objective: Create the OpenSpec-backed change `refactor-team-execution-storage` to move `lib/team/storage.ts` into `lib/storage/`, split generic SQLite setup from thread-specific persistence APIs, update affected runtime imports, and convert team execution tests to SQLite-backed fixtures while preserving explicit coverage for legacy JSON import behavior.
- [x] 2.2 Run validation and capture reviewer findings for "Refactor team execution storage modules"
