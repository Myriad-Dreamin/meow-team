## Context

This change captures proposal "Thread Tooltip on Status Lanes" as OpenSpec
change `status-lane-tooltip-a1-p1-thread-tooltip-on-status-lanes`. The
current `TeamStatusBar` polls `/api/team/status` every second and renders the
non-zero lane totals in `.workspace-status-lane-list` as passive status
pills, while `TeamWorkspace` already owns the living thread summaries,
archived thread summaries, and the existing `handleSelectThreadTab`
navigation path. The requested enhancement is to connect those existing data
sources so lane pills can explain which living threads are contributing to a
status and let the owner jump straight to the relevant thread tab without
changing archived-thread behavior or the existing status-bar controls.

## Goals / Non-Goals

**Goals:**

- Reuse `TeamWorkspace` as the source of truth for current living thread
  summaries and thread-tab selection.
- Bucket living thread lane contributions by status in a pure helper that is
  easy to test without browser-only tooling.
- Turn each non-zero lane pill into an accessible hover/focus/click trigger
  for a compact tooltip-style popover.
- Show only the threads that match the selected lane status and expose enough
  context to explain duplicate same-status lane counts.
- Keep the current settings/archive controls, polling behavior, and
  archived-thread scope intact.

**Non-Goals:**

- Redesign the broader status bar, run board, or thread detail surfaces.
- Add a new API route, router state, or archived-thread drilldown for this
  interaction.
- Change how lane counts, host telemetry, or thread summaries are persisted.
- Expand beyond targeted helper/status-bar coverage and the requested
  validation commands.

## Decisions

- Pass living threads and `handleSelectThreadTab` from `TeamWorkspace` into
  `TeamStatusBar` rather than adding a dedicated fetch or a second navigation
  path. This keeps thread selection aligned with the existing tab state and
  avoids duplicating workspace routing logic. Alternative considered: fetch
  thread detail inside the status bar. Rejected because it would create a new
  source of truth for navigation and make tooltip contents lag behind the
  workspace thread model.
- Add a pure status-bucketing helper that groups living `TeamThreadSummary`
  records by lane status and collapses repeated matches from the same thread
  into one entry with a multiplicity count. This keeps the pill-to-tooltip
  mapping testable and explains why a lane pill total can be larger than the
  number of unique rows. Alternative considered: derive the tooltip rows
  inline in the component. Rejected because the grouping rules are easier to
  verify in isolation than through stateful component assertions alone.
- Treat the lane panel as an interactive popover styled like a tooltip, not a
  strict tooltip. The trigger needs to stay reachable by hover, focus, and
  click, and the panel contains clickable rows that switch thread tabs.
  Alternative considered: hover-only tooltip behavior. Rejected because it is
  not robust for keyboard or narrow/touch layouts and is a poor fit for
  interactive content.
- Keep the existing `/api/team/status` polling loop for counts and telemetry,
  while using the current living thread summaries only for tooltip contents
  and thread navigation. Alternative considered: replace the polled lane
  totals with locally derived counts from the workspace thread list. Rejected
  because the approved scope says to keep status-bar polling intact; this
  change should enrich the lane pills, not redesign their data source.
- Limit styling work to status-bar selectors in `app/globals.css` and rely on
  targeted helper/status-bar coverage rather than broad UI refactors.
  Alternative considered: wider status-bar layout cleanup. Rejected because it
  would expand the proposal beyond the requested lane-tooltip interaction.

## Conventional Title

- Canonical request/PR title: `feat: show lane thread tooltips`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Count and row drift between polling sources] -> The status snapshot updates
  every second while the workspace thread list refreshes on its existing
  cadence, so the popover can briefly lag the pill count; preserve
  multiplicity text and keep the feature tied to the current living-thread
  source of truth instead of adding a second fetch.
- [Interactive tooltip accessibility] -> Use a trigger and popover flow that
  works for hover, focus, and click, and dismiss the panel when a row is
  chosen or the interaction ends.
- [Duplicate same-status lanes are confusing] -> Collapse repeated matches by
  thread and show multiplicity/context in the row so owners can reconcile the
  visible rows with the aggregate pill total.
- [Scope creep] -> Keep archived-thread behavior, status polling, and broader
  status-bar layout unchanged so the proposal stays implementable in one lane.

Planner deliverable reference: Implement one frontend-scoped proposal to let
status-lane pills reveal matching living threads and open the selected thread
tab from the workspace status bar.
