## Context

This change captures proposal "Allow sidebar scrolling" as OpenSpec change
`sidebar-scroll-a1-p1-allow-sidebar-scrolling`. The current workspace shell
already separates the sidebar header from `.workspace-nav`, but the height and
overflow chain across the shell and sidebar still lets the sidebar stretch with
its content instead of forcing overflow into the navigation region.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**

- Keep the left workspace sidebar constrained to the available workspace shell
  height so long thread lists scroll inside the sidebar instead of stretching
  the page shell.
- Preserve the sidebar header, Living Threads and Archived Threads rendering,
  active-thread selection, polling cadence, and Run Team and Settings entry
  points.
- Keep the implementation CSS-first and local to the existing workspace shell,
  adding only minimal sidebar markup when required to make the scroll region
  reliable.
- Validate the behavior across the current desktop layout and the stacked
  breakpoints below `1180px` and `920px`.

**Non-Goals:**

- Change thread grouping, sorting, status copy, or thread metadata rendering.
- Modify thread-detail panels, status-bar behavior, storage, or API contracts.
- Add feature flags, persistence behavior, or custom scrollbar redesign work.

## Decisions

- Keep the sidebar as a two-row shell with a fixed header and a dedicated
  scroll region underneath it. This targets the actual usability issue and
  avoids letting the header scroll out of view with the thread list.
- Fix the overflow behavior by tightening the height and `min-height: 0`
  relationship across the existing workspace shell, sidebar, and navigation
  container before introducing new structure. A minimal wrapper or class split
  in `components/team-workspace.tsx` is acceptable only if CSS alone cannot
  isolate the scrolling region reliably.
- Preserve the existing sidebar render flow and interaction handlers. The bug
  is layout-related, so changing thread data shaping or polling logic would add
  risk without helping the fix.
- Validate with a long enough thread list to force overflow and run `pnpm
  lint` plus `pnpm build` after implementation because the change touches
  shared workspace layout surfaces. Direct UI verification remains necessary
  because the failure mode is visual and breakpoint-sensitive.
- Keep the canonical request/PR title as
  `fix(ui/sidebar): enable sidebar scrolling`, and keep slash-delimited scope
  in conventional-title metadata `fix(ui/sidebar)` instead of changing the
  OpenSpec change path.

## Conventional Title

- Canonical request/PR title: `fix(ui/sidebar): enable sidebar scrolling`
- Conventional title metadata: `fix(ui/sidebar)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Overflow chain regression] -> Verify every ancestor in the workspace shell
  still exposes the shrink and overflow behavior needed for nested scrolling.
- [Responsive layout drift] -> Check both the desktop split view and the
  single-column breakpoints so the sidebar remains readable when stacked.
- [Scrollbar affordance differences] -> Prioritize functional scrolling first
  and keep styling changes minimal unless direct testing shows that users lose
  the scroll cue.
- [Markup creep] -> Limit any JSX changes to the smallest wrapper or class split
  that makes the scroll container deterministic.
