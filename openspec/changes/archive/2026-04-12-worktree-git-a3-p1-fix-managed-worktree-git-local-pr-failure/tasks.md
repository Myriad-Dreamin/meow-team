## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Fix managed-worktree `.git-local` PR failure" and confirm the canonical request/PR title is `fix(team/worktree): Fix managed-worktree `.git-local` PR failure`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `fix(team/worktree)` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [x] 2.1 Implement the approved objective: Implement one OpenSpec-aligned change that opens or refreshes a GitHub draft PR immediately after proposal approval, preserves that same PR through coder/reviewer/final-archive flow, rebases onto `main` and requeues the coding-review cycle on conflicts before marking the PR ready after machine review, and fixes managed-worktree git/gh subprocess resolution so the stale `node_modules/.bin/git` -> `.git-local` wrapper can no longer break proposal-time or final PR operations.
- [x] 2.2 Run validation and capture reviewer findings for "Fix managed-worktree `.git-local` PR failure"
