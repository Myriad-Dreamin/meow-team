## 1. Proposal Alignment

- [ ] 1.1 Review the approved OpenSpec artifacts for "Agent-backed OpenSpec proposal materialization" and confirm the canonical request/PR title is `feat(oht/workflow): Agent-backed OpenSpec proposal materialization`
- [ ] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `feat(oht/workflow)` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [ ] 2.1 Implement the approved objective: Replace hardcoded markdown generation in lib/team/openspec.ts with a dedicated Codex/OpenSpec artifact agent, preserve the current proposal dispatch and approval flow, and add regression coverage for artifact creation and failure handling.
- [ ] 2.2 Run validation and capture reviewer findings for "Agent-backed OpenSpec proposal materialization"
