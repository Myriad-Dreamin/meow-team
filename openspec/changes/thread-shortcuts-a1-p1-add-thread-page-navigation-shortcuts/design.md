## Context

This change captures proposal "Add thread page navigation shortcuts" as
OpenSpec change
`thread-shortcuts-a1-p1-add-thread-page-navigation-shortcuts`.
`TeamWorkspace` already owns the living-thread list, archived-thread list,
selected tab state, sidebar collapse state, and the existing handlers that
switch between the Run, Settings, and thread detail tabs. The component also
persists the selected tab through local storage, while
`buildThreadRepositoryGroups` already defines the repository grouping and
alphabetical thread ordering shown in the Living Threads sidebar.

## Goals / Non-Goals

**Goals:**

- Add guarded `Alt+N` and `Alt+1` through `Alt+9` navigation while a thread
  detail tab is active.
- Derive numeric shortcut targets from the same living-thread ordering the
  sidebar renders, excluding archived and terminal threads.
- Reuse the current workspace tab selection and persistence flow instead of
  introducing new routing or storage behavior.
- Keep the shortcut logic small, testable, and isolated from browser event
  edge cases through a pure helper and focused Vitest coverage.

**Non-Goals:**

- Add new pages, routes, APIs, or storage fields for shortcut navigation.
- Expand into browser-global, cross-window, or cross-tab keyboard control.
- Change archived-thread navigation, settings behavior, status-lane popovers,
  polling intervals, or server-side thread ordering semantics.
- Force support for browsers or keyboard layouts that never emit the requested
  `Alt+Digit` combinations.

## Decisions

- Keep shortcut ownership in `TeamWorkspace`. That component already owns
  `selectedTab`, living-thread data, and the existing run/thread selection
  handlers, so it is the narrowest place to attach keyboard handling without
  prop-drilling new state through the thread detail panel or app shell.
- Extract pure shortcut helpers for keyboard parsing and active-thread target
  derivation. This isolates browser key parsing, editable-target guards, and
  numeric index mapping so the change can be covered with helper-level Vitest
  tests instead of a large DOM integration harness.
- Reuse the current sidebar grouping and sorting rules to compute numeric
  targets. The implementation should flatten the grouped Living Threads order
  that `buildThreadRepositoryGroups` already produces, then filter out
  terminal thread statuses so `Alt+1` through `Alt+9` match visible active
  thread pages instead of the raw polling array order.
- Subscribe to `window` `keydown` events from `TeamWorkspace` with a stable
  listener pattern such as `useEffectEvent`. The listener should no-op unless
  a thread detail tab is selected, the event includes `Alt`, and the focused
  element is not an input, textarea, or contenteditable control.
- Route successful shortcuts through the existing tab handlers.
  `Alt+N` should call the Run Team selection path, and numeric shortcuts should
  call the same thread-tab selection path that sidebar clicks already use, so
  local-storage persistence and missing-thread fallback behavior remain
  unchanged.
- Treat missing numeric targets as a safe no-op. The handler should only call
  `preventDefault()` when a recognized shortcut actually maps to a supported
  workspace action.

## Conventional Title

- Canonical request/PR title: `feat: enable thread page shortcuts`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Living-thread destination ambiguity] -> Treat `Alt+N` as the existing Run
  Team and living-thread surface, and keep that assumption explicit in the
  proposal so approval can redirect it before implementation if needed.
- [Ordering drift] -> Reuse the current sidebar grouping and sorting helpers
  for shortcut targets instead of reimplementing a second thread ordering path.
- [Shortcut interference] -> Ignore editable targets and only prevent browser
  defaults after a shortcut is recognized and mapped to a workspace action.
- [Browser/layout differences] -> Fail safely when `Alt+Digit` does not arrive
  from the browser instead of expanding scope into platform-specific fallback
  handling in this pass.

## Migration Plan

- No data migration is required because the change is fully client-side and
  reuses existing selected-tab persistence.
- Roll back by removing the keydown subscription and shortcut helpers, which
  returns the workspace to click-only navigation without affecting stored
  thread data.

## Open Questions

- Should `Alt+N` continue to mean the existing Run Team and living-thread
  surface if a future dedicated Living Teams route is added, or should the
  shortcut be remapped at that time?
