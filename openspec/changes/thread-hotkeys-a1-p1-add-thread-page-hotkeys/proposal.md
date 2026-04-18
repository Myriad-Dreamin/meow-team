## Why

The selected thread page already exposes a left Living Threads navigator and a
right timeline anchor rail, but keyboard users still have to reach both
surfaces manually with pointer or tab-heavy navigation. Adding thread-scoped
hotkeys now keeps the existing thread-detail workflow faster without changing
backend data, storage, or routing contracts.

## What Changes

- Add thread-page-only hotkeys so `Alt+N` reveals the sidebar when needed and
  moves focus to the existing `Living Threads` navigation target for the active
  workspace.
- Add `Alt+1` through `Alt+9` support on the selected thread page so each digit
  jumps to the matching ordered thread timeline anchor produced by
  `buildTimelineAnchors`, keeping scroll position and active-rail highlighting
  aligned.
- Ignore supported hotkeys while focus is inside editable controls such as
  `input`, `textarea`, or content-editable regions so normal typing and
  feedback entry stay unaffected.
- Add targeted regression coverage for shortcut matching, editable-surface
  suppression, and anchor ordering without expanding the shortcut system beyond
  the thread detail view.

## Capabilities

### New Capabilities

- `thread-hotkeys-a1-p1-add-thread-page-hotkeys`: Define thread-detail keyboard
  navigation for the `Living Threads` sidebar target and ordered timeline
  anchors, including editable-surface guards and regression coverage.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat: enable thread page hotkeys`
- Conventional title metadata: `feat`
- The change name stays
  `thread-hotkeys-a1-p1-add-thread-page-hotkeys`; roadmap or topic scope does
  not move into the OpenSpec path.

## Impact

- Affected repository: `meow-team`
- Affected code paths: `components/team-workspace.tsx`,
  `components/thread-detail-timeline.tsx`, a small thread-hotkey helper and
  Vitest surface near the timeline helpers, and `app/globals.css` only if focus
  visibility polish is needed
- Systems affected: selected thread-detail keyboard navigation, sidebar reveal
  and focus management, and timeline anchor scrolling or active-link sync
