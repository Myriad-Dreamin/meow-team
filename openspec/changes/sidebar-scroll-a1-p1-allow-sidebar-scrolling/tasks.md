## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Allow sidebar scrolling"
  and confirm the canonical request/PR title is
  `fix(ui/sidebar): enable sidebar scrolling`
- [x] 1.2 Confirm the proposal is ready for pooled execution, the reusable
  worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
  can be claimed, and conventional-title metadata `fix(ui/sidebar)` stays
  separate from `branchPrefix` and change paths

## 2. Implementation

- [ ] 2.1 Implement the approved objective: constrain the workspace shell,
  sidebar, and navigation list so the left sidebar no longer stretches to
  absorb overflow, make the thread-navigation region below the sidebar header
  scroll independently when content exceeds the available height, and preserve
  Living Threads and Archived Threads rendering, active-thread selection,
  polling cadence, and Run Team and Settings actions with only minimal markup
  adjustment if CSS alone is insufficient
- [ ] 2.2 Validate the sidebar overflow fix with `pnpm lint`, `pnpm build`, and
  direct UI verification against a long enough thread list to force scrolling
  across the desktop and responsive stacked layouts
