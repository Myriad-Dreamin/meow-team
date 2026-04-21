## 1. Proposal Alignment

- [ ] 1.1 Review the approved OpenSpec artifacts for "Publish stage-generated lane commits" and confirm the canonical request/PR title is `feat(lanes/runtime): Publish stage-generated lane commits`
- [ ] 1.2 Confirm the proposal stays on the existing pooled coding-review workflow, uses reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`, and keeps conventional-title metadata `feat(lanes/runtime)` separate from `branchPrefix` and change paths

## 2. Shared Publish Infrastructure

- [ ] 2.1 Add a shared stage-end publish helper around the existing lane branch publication path that compares the current head with the recorded `pushedCommit`, skips redundant pushes, and returns updated publish metadata or blocking failure details
- [ ] 2.2 Reuse that helper in existing approval-time publication paths so already published heads keep truthful state and no-op approvals do not push the same commit twice

## 3. Stage-End Publication Flow

- [ ] 3.1 Publish coder and executor-generated commits immediately after implementation finishes and before reviewer or execution-reviewer work begins, failing the lane if that publish does not complete
- [ ] 3.2 Detect reviewer or execution-reviewer-authored branch changes for `needs_revision`, commit dirty worktree artifacts when needed, publish the resulting feedback head, and only then requeue the next implementation pass
- [ ] 3.3 Preserve the current reviewer-approved rebase plus ready-PR flow while routing final publication through the shared helper

## 4. Lane State and Runtime Messaging

- [ ] 4.1 Tighten `latestImplementationCommit` and `pushedCommit` updates so retries, approvals, and partial failures accurately show whether the latest lane head is already remote-backed
- [ ] 4.2 Update lane events, planner notes, and related runtime copy so intermediate branch publication is described clearly without changing the broader `planner -> coder -> reviewer` workflow

## 5. Regression Coverage and Validation

- [ ] 5.1 Add regression coverage for coder or executor commits, reviewer feedback commits, dirty-worktree reviewer artifacts, direct agent commits, unchanged-head no-op publication, and publish failures across standard and execute-mode lanes
- [ ] 5.2 Run `pnpm fmt`, targeted lane publication tests, `pnpm lint`, and `pnpm build` when the shared helper or runtime wiring changes require full validation
