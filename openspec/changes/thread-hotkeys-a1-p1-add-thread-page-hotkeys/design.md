## Context

`components/team-workspace.tsx` already owns the selected tab state, sidebar
visibility, and Living Threads navigation surface, while
`components/thread-detail-timeline.tsx` already derives ordered rail anchors
through `buildTimelineAnchors()` and tracks the active anchor as the user
scrolls. The request is frontend-only: no routing, storage, or API changes are
needed, but the shortcut handling must stay scoped to the selected thread tab,
avoid stealing input focus from editable controls, and preserve the existing
scroll and focus affordances on both sidebar and timeline navigation.

## Goals / Non-Goals

**Goals:**

- Add thread-page-only `Alt+N` behavior that reveals the sidebar if necessary
  and focuses the existing `Living Threads` navigation target without changing
  selection state semantics.
- Add `Alt+1` through `Alt+9` behavior that resolves against the ordered thread
  timeline anchors and reuses the current scroll-to-anchor and active-anchor
  behavior.
- Keep the matching logic small and pure so supported shortcuts, ignored
  contexts, and digit-to-anchor resolution are testable in Vitest.
- Prevent `preventDefault()` unless a supported shortcut is actually handled, so
  browser-reserved or unsupported combinations keep their normal behavior.

**Non-Goals:**

- Introducing global workspace shortcuts for the run or settings tabs.
- Adding a configurable shortcut registry or custom remapping UI.
- Changing backend thread data, persistence, archived-thread state, or routing.
- Redesigning the thread detail layout beyond any minimal focus-visibility
  polish required for discoverability.

## Decisions

1. Keep shortcut listening scoped to the selected thread tab in the workspace,
   while delegating matching and target resolution to a small pure helper near
   the timeline helper tests.
   Rationale: `TeamWorkspace` knows whether the user is on a thread, run, or
   settings tab, and already controls sidebar reveal state. A pure resolver can
   turn keyboard events plus ordered anchor metadata into explicit actions
   without binding tests to DOM behavior.
   Alternatives considered:
   - Register a global app-level listener. Rejected because it would need extra
     tab guards and increases the chance of affecting run or settings flows.
   - Keep all logic inline inside `team-workspace.tsx`. Rejected because the
     editable-surface and digit-resolution rules become harder to test.

2. Reuse existing navigation surfaces instead of inventing new thread routes or
   duplicate anchor registries.
   Rationale: `Alt+N` can reveal the existing sidebar and focus the current
   Living Threads control, while `Alt+1` through `Alt+9` can map directly to
   the ordered output of `buildTimelineAnchors()`. This keeps the feature
   aligned with current selection and scroll behavior.
   Alternatives considered:
   - Add hidden shortcut-only targets or route fragments. Rejected because the
     request only needs faster access to the existing sidebar and rail.
   - Maintain a second anchor order just for hotkeys. Rejected because it could
     drift from the visible rail ordering.

3. Treat editable controls as an explicit no-op boundary for supported
   shortcuts.
   Rationale: feedback forms, search inputs, and other content-editable regions
   need normal typing semantics. The shortcut resolver should reject events from
   editable targets before any sidebar reveal, focus move, or scroll action.
   Alternatives considered:
   - Allow shortcuts whenever `Alt` is pressed. Rejected because it would cause
     accidental navigation while composing feedback.

4. Limit digit shortcuts to the first nine ordered anchors and only intercept a
   digit when a matching target exists.
   Rationale: the requested mapping is `Alt+1` through `Alt+9`; anchoring the
   feature to the first nine visible targets keeps the behavior predictable and
   lets unsupported digits fall through without blocking browser defaults.
   Alternatives considered:
   - Wrap digits after nine or invent a `0` mapping. Rejected because neither
     behavior was requested and both add memorization cost.

## Conventional Title

- Canonical request/PR title: `feat: enable thread page hotkeys`
- Conventional title metadata: `feat`

## Risks / Trade-offs

- [The focused Living Threads target is inside a collapsed or hidden sidebar] ->
  Reveal the sidebar before moving focus and reuse the existing selected-thread
  button or group surface instead of creating a new hidden focus target.
- [Timeline anchor order changes could desync digit mapping from the visible
  rail] -> Resolve digits from `buildTimelineAnchors()` so hotkeys and visible
  rail links share one ordering source.
- [Browser or keyboard-layout `Alt` shortcuts conflict with the feature] -> Do
  not intercept unsupported combinations and only call `preventDefault()` after
  the resolver confirms a handled thread-page shortcut.
- [DOM-centric tests become brittle] -> Keep the core resolver pure and cover
  DOM integration with narrow component tests only where focus or scroll wiring
  matters.

## Migration Plan

- Add the pure shortcut resolver and editable-target guard near the timeline
  helper test surface, then wire the selected thread tab to consume its
  actions.
- Reuse existing sidebar visibility state and timeline scroll helpers instead of
  introducing migration or data backfill steps.
- Rollback is low risk because the change is frontend-only; the listener and
  helper can be removed without affecting stored thread state.

## Open Questions

- None. The proposal follows the planner-approved interpretation that "living
  teams" means the existing `Living Threads` sidebar section and "active pages"
  means the ordered thread-detail timeline anchors.
