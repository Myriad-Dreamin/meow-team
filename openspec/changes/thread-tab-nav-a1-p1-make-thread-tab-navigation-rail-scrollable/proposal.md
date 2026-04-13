## Why

Materialize an OpenSpec change for the selected thread tab's right-side navigation rail: update the thread-detail rail layout so long anchor lists get an independent scroll region, preserve sticky and active-anchor behavior across desktop and narrow breakpoints, and validate usability with a dense timeline without changing thread data or left-sidebar behavior. Fix the selected thread tab navigation rail so long anchor lists scroll independently without breaking active-anchor behavior or responsive layout. This proposal is one candidate implementation for the request: The navigation bar in thread tab should be scrollable.

## What Changes

- Introduce the `thread-tab-nav-a1-p1-make-thread-tab-navigation-rail-scrollable` OpenSpec change for proposal "Make thread tab navigation rail scrollable".
- Materialize an OpenSpec change for the selected thread tab's right-side navigation rail: update the thread-detail rail layout so long anchor lists get an independent scroll region, preserve sticky and active-anchor behavior across desktop and narrow breakpoints, and validate usability with a dense timeline without changing thread data or left-sidebar behavior.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities
- `thread-tab-nav-a1-p1-make-thread-tab-navigation-rail-scrollable`: Materialize an OpenSpec change for the selected thread tab's right-side navigation rail: update the thread-detail rail layout so long anchor lists get an independent scroll region, preserve sticky and active-anchor behavior across desktop and narrow breakpoints, and validate usability with a dense timeline without changing thread data or left-sidebar behavior.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `fix: Make thread tab navigation rail scrollable`
- Conventional title metadata: `fix`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.


## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Single proposal recommended. Suggested OpenSpec seed: `thread-tab-nav-scroll`. Objective: fix the right-side navigation rail in the selected thread tab so it becomes reliably scrollable for long timelines. The current thread-detail view already renders a dedicated rail container in `components/thread-detail-timeline.tsx` and already tries to keep the active anchor visible, so the approved work should focus on the CSS/layout contract in `app/globals.css` and any minimal component adjustments needed to make that scroll region real. Implementation shape: - constrain the rail card/link list so the anchor list can scroll independently from the main timeline content - preserve sticky desktop behavior and the current smaller-screen capped rail behavior - verify active-anchor highlighting and rail auto-scroll still work after the layout fix - validate the result with a long thread so both the main timeline and the rail remain usable Scope boundaries: - do not change timeline anchor generation, approval flows, or sidebar repository/thread navigation - do not expand this into a broader thread-tab redesign Approval note: this is one coherent UI fix. The shared coder/reviewer pool stays idle until the owner approves it.
