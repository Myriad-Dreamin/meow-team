## Why

The selected thread currently splits status metadata between the workspace
editor header and the chat timeline header, which duplicates information and
makes the old `.workspace-editor-meta` row the only place that surfaces
archived state. Consolidating status into the chat link strip keeps the
detail view metadata in one place and removes an obsolete header row without
changing thread-state logic.

## What Changes

- Introduce the `chat-strip-status-a1-p1-relocate-thread-status-into-the-chat-link-strip` OpenSpec change for proposal "Relocate thread status into the chat link strip".
- Move the selected thread status pill and archived badge into
  `.thread-chat-link-strip` so status stays visible alongside the existing
  thread metadata chips.
- Remove the active-thread `.workspace-editor-meta` markup from the workspace
  editor header and delete the obsolete shared CSS plus responsive override.
- Narrow chat-strip chip styling so plain metadata chips, links, and
  `.status-pill` elements can coexist without visual regressions across the
  current desktop and mobile layouts.
- Keep the work scoped to presentation and layout; no thread-state logic or
  status derivation changes are required.

## Capabilities

### New Capabilities
- `chat-strip-status-a1-p1-relocate-thread-status-into-the-chat-link-strip`: Consolidate selected-thread status visibility into the chat link strip, remove the redundant workspace editor metadata row, and preserve archived-state visibility plus mixed chip styling.

### Modified Capabilities
- None.

## Conventional Title

- Canonical request/PR title: `feat(thread/header): relocate thread status strip`
- Conventional title metadata: `feat(thread/header)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected surfaces: `components/team-workspace.tsx`,
  `components/thread-detail-timeline.tsx`, and `app/globals.css`
- Coding-review execution: pooled workers with reusable worktrees from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal: "Relocate thread status into the chat link
  strip". Objective: update the thread detail header markup and shared styles
  so thread status indicators render inside `.thread-chat-link-strip`, remove
  `.workspace-editor-meta` from the workspace editor header, clean up
  obsolete CSS selectors and responsive overrides, and verify the status-pill
  styling still works correctly alongside the existing metadata chips.
