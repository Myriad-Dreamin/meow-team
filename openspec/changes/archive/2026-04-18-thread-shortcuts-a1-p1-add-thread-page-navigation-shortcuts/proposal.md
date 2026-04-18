## Why

The workspace already lets owners switch threads from the sidebar and status
surfaces, but a selected thread detail tab has no direct keyboard path back to
the living-thread workspace or across other active thread pages. Adding
guarded `Alt+N` and `Alt+1` through `Alt+9` shortcuts keeps thread navigation
fast without changing routing, APIs, or the existing tab persistence model.

## What Changes

- Introduce the `thread-shortcuts-a1-p1-add-thread-page-navigation-shortcuts`
  OpenSpec change for proposal "Add thread page navigation shortcuts".
- Add workspace-scoped `Alt+N` handling while a thread detail tab is open so
  the owner can return to the existing Run Team and living-thread surface.
- Add `Alt+1` through `Alt+9` thread shortcuts that open the first nine active
  living thread pages using the current sidebar repository grouping and thread
  sorting order.
- Ignore shortcut handling when focus is inside editable UI, and no-op when a
  numeric shortcut has no matching active thread target.
- Reuse the existing `TeamWorkspace` tab selection and persistence flow, then
  add targeted Vitest coverage for shortcut parsing, ordering, and guard
  behavior.

## Capabilities

### New Capabilities

- `thread-shortcuts-a1-p1-add-thread-page-navigation-shortcuts`: Add guarded
  thread detail keyboard shortcuts that return to the living-thread surface
  with `Alt+N`, open the first nine active living thread pages with
  `Alt+1` through `Alt+9`, preserve existing tab persistence, and cover the
  shortcut behavior with focused regression tests.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat: enable thread page shortcuts`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Expected implementation surfaces: `components/team-workspace.tsx`, a small
  pure shortcut helper plus Vitest coverage, and any shared sidebar-ordering
  utility extraction needed to keep shortcut indices aligned with the current
  Living Threads rendering
- No API, storage-schema, or dependency changes are expected; archived-thread
  behavior, settings navigation, status-lane popovers, polling, and the
  existing selected-tab persistence contract must remain intact
- Planner deliverable: Single proposal recommended because guarded keyboard
  parsing, deterministic active-thread ordering, workspace tab selection, and
  regression coverage all depend on the same `TeamWorkspace` state surfaces
- Assumption: `Alt+N` returns to the existing Run Team and living-thread
  surface because the app does not expose a separate Living Teams route today;
  approval feedback can redirect this destination before coding if needed
