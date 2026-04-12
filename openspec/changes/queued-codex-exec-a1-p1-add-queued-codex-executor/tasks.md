## 1. Proposal Alignment

- [ ] 1.1 Review the approved OpenSpec artifacts for "Add queued Codex executor" and confirm the canonical request/PR title is `feat: Add queued Codex executor`
- [ ] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `feat` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [ ] 2.1 Implement the approved objective: Implement a shared queued `TeamStructuredExecutor` for the default Codex executor, cap concurrent executions at `teamConfig.dispatch.workerCount`, keep all other concurrency controls unchanged, and cover the wiring with focused tests.
- [ ] 2.2 Run validation and capture reviewer findings for "Add queued Codex executor"
