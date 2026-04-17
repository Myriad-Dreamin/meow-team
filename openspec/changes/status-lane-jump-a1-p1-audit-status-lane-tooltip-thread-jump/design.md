## Context

This change captures proposal "Audit status-lane tooltip thread jump" as
OpenSpec change `status-lane-jump-a1-p1-audit-status-lane-tooltip-thread-jump`.
The current `TeamStatusBar` already renders non-zero
`.workspace-status-lane-list` pills as interactive popovers backed by
`buildTeamStatusLaneThreadBuckets`, and `TeamWorkspace` already owns the
existing `handleSelectThreadTab` path that switches the selected living thread.
The follow-up request is narrower than the original feature: reproduce any
current gap in that shipped flow, then repair only the minimal surface needed
to restore reliable thread discovery and thread-tab jumps.

## Goals / Non-Goals

**Goals:**

- Treat the request as a regression audit first, not a status-bar redesign.
- Preserve the existing `TeamWorkspace` thread-selection path and current lane
  bucketing while restoring any broken thread-row navigation in the popover
  flow.
- Confirm that hover, focus, and click all keep opening non-zero lane pills
  and that popover rows show only matching living threads with same-thread
  multiplicity context.
- Add focused rendered interaction coverage around the popover open/dismiss
  flow and thread-row activation so this regression is caught automatically.
- Keep settings, archived-thread reveal, host telemetry polling, and
  archived-thread exclusion unchanged.

**Non-Goals:**

- Rebuild or broaden the archived `status-lane-tooltip` feature.
- Redesign the workspace status bar, lane taxonomy, or thread-detail UI.
- Add new API routes, polling sources, or a second thread-navigation path.
- Expand into general thread-navigation work outside the status-lane popover.

## Decisions

- Start from the current implementation in `components/team-status-bar.tsx`
  and `components/team-workspace.tsx` and reproduce the reported gap before
  changing behavior. Alternative considered: rewrite the lane-popover flow
  from the archived feature request. Rejected because current head already
  implements the core behavior and the owner asked for a regression follow-up.
- Reuse the existing `handleSelectThreadTab` navigation path and current
  popover dismissal state rather than adding direct links, router state, or a
  new selection helper. Alternative considered: introduce a dedicated
  status-bar navigation API. Rejected because it would duplicate existing
  workspace tab state and expand scope beyond the fix.
- Preserve `buildTeamStatusLaneThreadBuckets` as the lane-to-thread mapping
  source and adjust it only if the audit proves a real mismatch in matching
  thread rows or multiplicity behavior. Alternative considered: derive a new
  status-bar-specific data source from `/api/team/status`. Rejected because the
  approved scope says to leave broader status-bar behavior unchanged.
- Add rendered interaction coverage around `TeamStatusBar` instead of relying
  only on `team-status-bar-lane-utils` helper tests. Alternative considered:
  keep helper-only coverage. Rejected because the current tests are mostly
  pure-function focused and can miss popover open/close and row-click
  integration regressions.

## Conventional Title

- Canonical request/PR title:
  `fix(workspace/status-bar): restore status lane thread links`
- Conventional title metadata: `fix(workspace/status-bar)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Regression is not reproducible on current head] -> Encode the expected flow
  in focused rendered interaction coverage first and avoid speculative
  refactors if the existing behavior already passes.
- [Polling totals and living-thread refreshes can briefly drift] -> Keep the
  current polling and thread-summary sources, and limit fixes to matching-row
  rendering and thread-jump behavior instead of redesigning data flow.
- [Popover interactions can regress differently across hover, focus, and
  click] -> Cover all three triggers plus row-click dismissal/navigation in the
  rendered test path before treating the work as complete.
- [Scope creep back into status-bar polish] -> Keep settings, archived-thread
  controls, telemetry polling, and archived-thread exclusion explicitly out of
  scope for this follow-up.

Planner deliverable reference: Single proposal only if the request is treated
as a regression follow-up. Reproduce any current gap in the existing
status-lane popover flow, then apply only the targeted fixes needed so
non-zero lane pills reveal the matching living threads and clicking a thread
row reuses the existing thread-tab navigation path while dismissing the
popover; add focused interaction coverage and leave broader status-bar
behavior unchanged.
