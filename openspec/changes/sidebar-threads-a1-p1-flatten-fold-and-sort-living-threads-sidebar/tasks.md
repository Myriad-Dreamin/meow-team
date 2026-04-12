## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Flatten, fold, and sort Living Threads sidebar" and confirm the canonical request/PR title is `feat: Flatten, fold, and sort Living Threads sidebar`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `feat` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [x] 2.1 Implement the approved objective: Suggested OpenSpec change seed: `living-threads-a1-p1-flatten-fold-and-sort-sidebar-groups`. Update the left Living Threads sidebar so repository groups render as flat sections instead of bordered containers, each group can be collapsed or expanded without breaking active-thread selection, repository groups and threads are ordered alphabetically with stable tie-breakers, and each thread item uses a three-line layout: title, `Thread <short-id> - <status>`, and `Updated <timestamp>`. Keep scope to the sidebar rendering/data-shaping surfaces plus CSS and targeted regression tests, while preserving existing polling, fallback `No Repository` handling, run/settings tabs, and thread detail behavior.
- [x] 2.2 Run validation and capture reviewer findings for "Flatten, fold, and sort Living Threads sidebar"
