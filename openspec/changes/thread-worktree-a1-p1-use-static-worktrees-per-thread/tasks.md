## 1. Proposal Alignment

- [ ] 1.1 Review the approved OpenSpec artifacts for "Use static worktrees per thread" and confirm the canonical request/PR title is `refactor: Use static worktrees per thread`
- [ ] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `refactor` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [ ] 2.1 Implement the approved objective: Refactor `lib/team/coding/` so each living thread reserves one managed `meow-N` worktree before planning starts, reuses that same worktree across proposal materialization and all lane execution, releases it only when the thread is archived, and replaces `TeamRunEnv.createWorktree` with resolved `Worktree` context plus updated persistence, scheduling, compatibility handling, and regression coverage.
- [ ] 2.2 Run validation and capture reviewer findings for "Use static worktrees per thread"
