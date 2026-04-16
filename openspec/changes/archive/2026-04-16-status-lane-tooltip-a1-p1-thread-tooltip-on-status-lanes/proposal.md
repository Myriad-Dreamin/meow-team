## Why

The workspace status bar already shows aggregated lane counts, but each lane
pill is passive and gives no way to see which living threads are driving that
status. Owners have to scan the living-thread tabs to map a count back to the
right thread, and same-status duplicate lanes from one thread can make the
pill total harder to interpret.

## What Changes

- Introduce the `status-lane-tooltip-a1-p1-thread-tooltip-on-status-lanes`
  OpenSpec change for proposal "Thread Tooltip on Status Lanes".
- Pass current living `TeamThreadSummary` records and the existing thread-tab
  selection handler into `TeamStatusBar` so status-lane navigation reuses the
  current workspace state instead of inventing a new routing path.
- Add a pure helper that buckets living threads by active `workerLanes`
  status, preserving thread title, short thread ID, and same-status
  multiplicity when one thread contributes more than once to a lane pill.
- Replace passive non-zero lane pills in `.workspace-status-lane-list` with
  interactive hover/focus/click tooltip-style popovers that list the matching
  living threads and switch to the clicked thread tab.
- Keep the existing settings button, archived-thread toggle, host telemetry
  polling, and archived-thread behavior unchanged; limit styling work to the
  status bar surface and include targeted helper coverage plus `pnpm fmt`,
  `pnpm lint`, `pnpm test`, and `pnpm build`.

## Capabilities

### New Capabilities

- `status-lane-tooltip-a1-p1-thread-tooltip-on-status-lanes`: Let each
  non-zero status-lane pill reveal the living threads that currently
  contribute to that lane state and open the selected thread tab from the
  tooltip-style popover.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat: show lane thread tooltips`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected surfaces: `components/team-workspace.tsx`,
  `components/team-status-bar.tsx`, `app/globals.css`, and targeted
  status-bar helper tests
- Coding-review execution: pooled workers with reusable worktrees from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Single proposal recommended. Suggested OpenSpec seed:
  `status-lane-thread-tooltip`. Objective: extend the workspace status bar so
  each non-zero status pill in `workspace-status-lane-list` can reveal the
  living threads that currently contribute to that lane status, and let the
  owner jump directly into the matching thread tab from that panel. Use the
  existing `TeamWorkspace` thread state as the navigation source of truth,
  group living `TeamThreadSummary` records by active worker-lane status,
  render the lane pills as interactive tooltip-style popovers, keep archived
  threads out of scope, and validate with targeted coverage plus `pnpm fmt`,
  `pnpm lint`, `pnpm test`, and `pnpm build`.
