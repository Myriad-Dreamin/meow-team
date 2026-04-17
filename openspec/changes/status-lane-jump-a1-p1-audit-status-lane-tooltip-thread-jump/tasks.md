## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Audit status-lane tooltip thread jump" and confirm the canonical request/PR title is `fix(workspace/status-bar): restore status lane thread links`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `fix(workspace/status-bar)` stays separate from `branchPrefix` and change paths

## 2. Regression Audit And Repair

- [ ] 2.1 Reproduce the current `workspace-status-lane-list` gap with focused rendered interaction coverage that exercises hover, focus, and click triggers, matching living-thread filtering, same-thread multiplicity, and thread-row activation from the popover
- [ ] 2.2 Apply only the targeted fix needed in `components/team-status-bar.tsx`, `components/team-workspace.tsx`, or related status-lane helpers so clicking a thread row dismisses the popover and reuses the existing thread-tab selection path without changing broader status-bar behavior

## 3. Validation

- [ ] 3.1 Run `pnpm fmt`, `pnpm lint`, targeted tests for the status-lane popover flow, and `pnpm build` if the repaired surface changes component integration
- [ ] 3.2 Capture reviewer findings or confirm none for "Audit status-lane tooltip thread jump"
