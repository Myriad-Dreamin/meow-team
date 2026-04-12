## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Centralize CLI command runners" and confirm the canonical request/PR title is `refactor: Centralize CLI command runners`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `refactor` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [x] 2.1 Implement the approved objective: Create `lib/cli-tools` shared exec helpers for `git`, `gh`, and `openspec`, migrate the existing git/team/OpenSpec modules to those wrappers, and validate that command behavior and failure surfaces remain unchanged.
- [x] 2.2 Run validation and capture reviewer findings for "Centralize CLI command runners"
