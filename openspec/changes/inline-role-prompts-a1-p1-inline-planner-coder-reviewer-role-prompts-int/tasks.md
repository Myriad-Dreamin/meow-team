## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Inline planner/coder/reviewer role prompts into `lib/team/roles`" and confirm the canonical request/PR title is `refactor(team/roles): Inline planner/coder/reviewer role prompts into`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `refactor(team/roles)` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [x] 2.1 Implement the approved objective: Consolidate the role system instructions into the existing `lib/team/roles/*.prompt.md` templates, remove the duplicate `prompts/roles` registry/loading path, and update metadata, docs, and validation so the harness keeps the same workflow behavior with a single prompt source.
- [x] 2.2 Run validation and capture reviewer findings for "Inline planner/coder/reviewer role prompts into `lib/team/roles`"
