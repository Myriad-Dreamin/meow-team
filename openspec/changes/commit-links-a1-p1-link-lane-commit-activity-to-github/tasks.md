## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Link lane commit activity to GitHub" and confirm the canonical request/PR title is `feat(lane/commits): Link lane commit activity to GitHub`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `feat(lane/commits)` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [x] 2.1 Implement the approved objective: Update dispatch commit-related activity/event messages to emit explicit markdown links when a GitHub commit URL exists, render those messages safely in the thread UI with `markdown-it`, and cover the behavior with regression tests without regex-based auto-linking.
- [ ] 2.2 Run validation and capture reviewer findings for "Link lane commit activity to GitHub"
