## 1. Proposal Alignment

- [ ] 1.1 Review the approved OpenSpec artifacts for "Extract GitHub platform adapter and interfaces" and confirm the canonical request/PR title is `refactor(platform/gh): Extract GitHub platform adapter and interfaces`
- [ ] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `refactor(platform/gh)` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [ ] 2.1 Implement the approved objective: Introduce `lib/platform` contracts and a `lib/platform/gh` implementation for GitHub remote normalization, branch publishing, and pull-request synchronization, then rewire harness callers and tests to use that adapter without changing current GitHub behavior.
- [ ] 2.2 Run validation and capture reviewer findings for "Extract GitHub platform adapter and interfaces"
