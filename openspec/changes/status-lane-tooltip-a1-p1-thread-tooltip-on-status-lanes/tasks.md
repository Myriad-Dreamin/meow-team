## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Thread Tooltip on Status Lanes" and confirm the canonical request/PR title is `feat: show lane thread tooltips`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `feat` stays separate from `branchPrefix` and change paths

## 2. Thread Data Wiring

- [x] 2.1 Pass living `TeamThreadSummary` records and the existing thread-tab selection handler from `components/team-workspace.tsx` into `TeamStatusBar`, keeping archived-thread behavior and existing status polling unchanged
- [x] 2.2 Add a pure helper plus targeted Vitest coverage to bucket living threads by lane status, preserving thread title, short thread ID, and same-status multiplicity for tooltip rendering

## 3. Status Bar Interaction And Validation

- [x] 3.1 Replace passive non-zero lane pills in `components/team-status-bar.tsx` with accessible hover/focus/click tooltip-style popovers that list matching living threads and switch to the clicked thread tab while dismissing the panel
- [x] 3.2 Update the status-bar-only styling in `app/globals.css`, then run `pnpm fmt`, `pnpm lint`, `pnpm test`, and `pnpm build`
