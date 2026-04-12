## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Centralize CLI command runners" and confirm the canonical request/PR title is `refactor: Centralize CLI command runners`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `refactor` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [ ] 2.1 Implement the approved objective: Move the duplicated `git`, `gh`, and `openspec` exec wrappers into `lib/cli-tools` with one shared process runner, update the existing team and git modules to consume it, and preserve current behavior through validation and targeted tests.
- [ ] 2.2 Run validation and capture reviewer findings for "Centralize CLI command runners"
