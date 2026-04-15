## Context

This change captures proposal "Relocate thread status into the chat link
strip" as OpenSpec change
`chat-strip-status-a1-p1-relocate-thread-status-into-the-chat-link-strip`.
The current selected-thread header renders the request title plus a separate
`.workspace-editor-meta` row for status, archive, thread ID, and repository
metadata, while `ThreadDetailTimeline` already exposes the thread-level chip
cluster in `.thread-chat-link-strip`. The requested scope is to consolidate
those status indicators into the chat strip, remove the redundant header row,
and keep archived-state visibility intact without changing thread-state
computation.

## Goals / Non-Goals

**Goals:**
- Render the selected thread status pill inside `.thread-chat-link-strip`
  beside the existing thread metadata chips.
- Preserve archived-state visibility after removing the old header metadata
  row.
- Delete obsolete `.workspace-editor-meta` markup and CSS, including the
  mobile-only override.
- Narrow shared chip selectors so plain metadata chips and `.status-pill`
  styles can coexist without visual regressions.
- Keep the proposal self-contained so one pooled coder/reviewer lane can
  execute it after approval.

**Non-Goals:**
- Change how thread status or archive state is computed, stored, or labeled.
- Redesign unrelated thread detail layout, sidebar behavior, or status-bar UI.
- Introduce new metadata fields or interactions in the thread header.
- Expand into broader timeline styling cleanup beyond what the relocation
  requires.

## Decisions

- Render the selected thread status and archived badge in
  `.thread-chat-link-strip` rather than duplicating them across both headers.
  This keeps the thread detail metadata cluster in one location and avoids the
  old split between the workspace editor header and the chat timeline header.
  Alternative considered: keep both surfaces in sync. Rejected because it
  preserves duplication and leaves the obsolete header row in place.
- Remove `.workspace-editor-meta` from the active-thread branch in
  `components/team-workspace.tsx` and let the workspace editor header focus on
  the request title. Alternative considered: keep the row for non-status
  metadata only. Rejected because it still fragments thread metadata across
  two adjacent headers.
- Scope generic chat-strip chip styles to plain strip items and links while
  allowing `.status-pill` to keep its status-specific palette and spacing.
  Alternative considered: continue styling all strip children uniformly and
  override status pills afterward. Rejected because the broad selector is what
  currently risks pill-style collisions.
- Preserve existing helper-driven labels and conditionals for status and
  archived state instead of introducing new display logic. Alternative
  considered: create chat-strip-specific status rendering helpers. Rejected
  because the change is presentation-only and should reuse the current thread
  state contract.

## Conventional Title

- Canonical request/PR title: `feat(thread/header): relocate thread status strip`
- Conventional title metadata: `feat(thread/header)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Archived visibility regression] -> Move the archived badge into the chat
  strip with the status pill so removing `.workspace-editor-meta` does not
  hide archive state.
- [Selector collisions] -> Narrow the chat-strip chip selectors so plain chips,
  links, and `.status-pill` elements do not fight over background, casing, or
  spacing.
- [Responsive wrapping regressions] -> Verify the mixed chip row still wraps
  cleanly at the current mobile breakpoint after deleting the old
  `.workspace-editor-meta` override.
- [Scope creep] -> Keep the change limited to thread header markup and shared
  CSS rather than broad timeline restyling.

Planner deliverable reference: Consolidate thread status display into the
thread chat link strip and delete the obsolete workspace editor meta row.
