## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Split `network.ts` into stage-oriented `lib/team/coding` modules" and confirm the canonical request/PR title is `refactor(team/coding): Split `network.ts` into stage-oriented`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `refactor(team/coding)` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [x] 2.1 Implement the approved objective: Create `lib/team/coding/index.ts` as the primary orchestration entrypoint, move the current `lib/team/network.ts` implementation into stage-oriented files such as `plan.ts` plus a `shared.ts` for shared run-state types/helpers, update internal callers/tests/docs/spec references to the new boundary, and preserve existing planner, scheduling, approval, and archive behavior. Keep `lib/team/network.ts` only as a thin compatibility shim if the migration genuinely requires it.
- [x] 2.2 Run validation and capture reviewer findings for "Split `network.ts` into stage-oriented `lib/team/coding` modules"
