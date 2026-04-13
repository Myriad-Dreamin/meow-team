## 1. Proposal Alignment

- [ ] 1.1 Review the approved OpenSpec artifacts for "Use static worktrees per thread" and confirm the canonical request/PR title is `refactor: Use static worktrees per thread`
- [ ] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `refactor` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [ ] 2.1 Implement the approved objective: Refactor `lib/team/coding` so each living repository-backed thread claims one managed `meow-N` worktree before planning, persists that resolved `Worktree` across planning, proposal materialization, coding, review, final archive, and replanning, removes dynamic `createWorktree` usage from the run env and stage transitions, releases the slot only when the thread is archived, and updates legacy compatibility plus regression coverage for the new thread-scoped lifecycle.
- [ ] 2.2 Run validation and capture reviewer findings for "Use static worktrees per thread"
