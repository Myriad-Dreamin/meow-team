## 1. Proposal Alignment

- [ ] 1.1 Review the approved OpenSpec artifacts for "Extract harness role prompt templates" and confirm the canonical request/PR title is `refactor(team/roles): Extract harness role prompt templates`
- [ ] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `refactor(team/roles)` stays separate from `branchPrefix` and change paths

## 2. Implementation

- [ ] 2.1 Implement the approved objective: Move the inline prompt construction in `lib/team/roles` into colocated `meow-prompt` markdown files, preserve the separate `prompts/roles` role definitions, and extend typed prompt-import support plus regression coverage so the new templates pass format, lint, test, typecheck, and build validation.
- [ ] 2.2 Run validation and capture reviewer findings for "Extract harness role prompt templates"
