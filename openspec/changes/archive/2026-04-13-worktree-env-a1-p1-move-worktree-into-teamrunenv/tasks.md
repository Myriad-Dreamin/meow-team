## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Move worktree into TeamRunEnv" and confirm the canonical request/PR title is `refactor(team/coding): Move worktree into TeamRunEnv`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `refactor(team/coding)` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [x] 2.1 Implement the approved objective: Extract worktree-specific logic from `lib/team/coding/dispatch.ts` into dedicated `lib/team/coding/*` helpers, introduce a narrow shared `Worktree` abstraction, and rewire planner/request-title/coder/reviewer execution so `TeamRunEnv` constructs and passes that worktree context instead of raw `worktreePath` strings while preserving existing dispatch behavior and regression coverage.
- [x] 2.2 Run validation and capture reviewer findings for "Move worktree into TeamRunEnv"
