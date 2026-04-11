## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Fix Parallel Worktree Allocation"
- [x] 1.2 Confirm the proposal is ready for pooled execution and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed

## 2. Implementation

- [x] 2.1 Implement the approved objective: Implement one OpenSpec-aligned change that gives each planner assignment its own staging worktree, assigns coder/reviewer worktree slots from the shared cross-thread pool, preserves slot reuse for active lanes, and adds regression coverage for concurrent runs.
- [x] 2.2 Run validation and capture reviewer findings for "Fix Parallel Worktree Allocation"
