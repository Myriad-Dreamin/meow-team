## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Merge team dispatch orchestration into network" and confirm the canonical request/PR title is `refactor(team/network): Merge team dispatch orchestration into network`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `refactor(team/network)` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [x] 2.1 Implement the approved objective: Consolidate `lib/team/dispatch.ts` into `lib/team/network.ts`, move route and internal callers to the unified module, preserve current planning/approval/replan behavior, and merge all dispatch regression suites into `lib/team/network.test.ts` before deleting the standalone dispatch module and tests.
- [x] 2.2 Run validation and capture reviewer findings for "Merge team dispatch orchestration into network"
