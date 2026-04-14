## Why

The left workspace sidebar currently stretches with its thread list instead of
constraining to the available shell height, which makes long Living Threads or
Archived Threads lists harder to navigate and pushes overflow handling onto the
page shell. Materializing one UI-only proposal now keeps the fix focused on the
workspace layout bug before more threads accumulate in day-to-day use.

## What Changes

- Introduce the `sidebar-scroll-a1-p1-allow-sidebar-scrolling` OpenSpec change
  for proposal "Allow sidebar scrolling".
- Constrain the workspace shell, sidebar, and navigation sizing chain so the
  sidebar no longer stretches to absorb thread-list overflow.
- Make the thread-navigation region below the sidebar header scroll
  independently while preserving the header, Living Threads and Archived
  Threads rendering, active-thread selection, polling cadence, and Run Team and
  Settings entry points.
- Keep the implementation CSS-first, with only minimal sidebar markup changes
  if a wrapper or class split is required to make scrolling reliable across the
  existing desktop and stacked responsive layouts.

## Capabilities

### New Capabilities

- `sidebar-scroll-a1-p1-allow-sidebar-scrolling`: Fix the left workspace
  sidebar so thread navigation scrolls independently inside the full-height
  shell when content exceeds the available height, while preserving the current
  sidebar header, thread interactions, and mobile stacking behavior.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `fix(ui/sidebar): enable sidebar scrolling`
- Conventional title metadata: `fix(ui/sidebar)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected surfaces: `components/team-workspace.tsx`, `app/globals.css`, and
  direct sidebar overflow validation with a long enough thread list to force
  scrolling
- Coding-review execution: pooled workers with reusable worktrees from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: One coherent proposal is the right shape for this
  request because the fix is confined to the left workspace sidebar layout.
  Implementation should focus on the shell height and overflow relationship,
  keep the scrollable region inside the thread-navigation area below the
  sidebar header, preserve all current thread interactions, and validate the
  desktop and responsive breakpoints without changing thread grouping, sorting,
  metadata copy, storage, or API behavior.
