## Context

This change captures proposal "Hide the left sidebar by default" as OpenSpec change `sidebar-default-a1-p1-hide-the-left-sidebar-by-default`.
Today `TeamWorkspace` always renders the sidebar as the first workspace column, while `TeamStatusBar` remains visible across run, settings, and thread views. Thread selection, archived-thread reveal, and repository-group collapse state already live in the workspace shell, so the sidebar default can change without introducing new backend APIs.

## Goals / Non-Goals

**Goals:**

- Make the editor pane the default focus area by starting with the left sidebar collapsed.
- Add an always-visible reveal/toggle control outside the sidebar so living and archived thread navigation stays reachable.
- Preserve existing thread selection, archived-thread reveal, repository-group collapse, and status-lane navigation behavior when the sidebar is hidden or reopened.
- Update desktop and narrow-screen layout rules so collapsing the sidebar removes unused space instead of leaving an empty rail.
- Add focused automated coverage for sidebar visibility defaults and toggle-state logic using the current Vitest setup.

**Non-Goals:**

- Redesign thread grouping, archived-thread behavior, or status-lane interactions.
- Introduce a broader workspace preferences system.
- Change backend thread/status APIs or add new dependencies for this feature.

## Decisions

- Keep sidebar visibility state in `TeamWorkspace` and default it to hidden. This shell already owns selected-tab, archived-thread, and repository-group state, so it is the narrowest place to coordinate visibility without duplicating state across components.
- Add the reveal/toggle control to `TeamStatusBar`, which stays mounted even when the sidebar is hidden. This keeps the affordance visible across run, settings, and thread detail views without introducing overlay chrome inside the editor.
- Collapse the sidebar by removing it from layout space rather than visually clipping a still-mounted rail. The hidden state should eliminate the desktop grid column and suppress the narrow-screen stacked sidebar block so the editor expands cleanly.
- Keep sidebar visibility independent from selected thread and archived-thread state. Selecting a thread from another surface, such as a status-lane popover, should not force the sidebar open; reopening the sidebar should restore the existing navigation context.
- Prefer focused helper-level Vitest coverage over a large integration harness for this change. Small pure helpers or derived-state utilities can lock in default-collapsed behavior and state-preservation rules with less test scaffolding.

## Conventional Title

- Canonical request/PR title: `feat(workspace/sidebar): collapse left sidebar by default`
- Conventional title metadata: `feat(workspace/sidebar)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Navigation discoverability] -> Keep the reveal control in always-visible status-bar chrome with explicit accessible labels and active-state styling.
- [Responsive layout regressions] -> Update collapse-specific desktop and narrow-screen CSS together so the hidden sidebar does not leave dead space or an empty stacked section.
- [State coupling bugs] -> Keep sidebar visibility separate from selected thread, archived-thread reveal, and repository-group collapse state, then cover those expectations with focused regression tests.
- [Persistence ambiguity] -> Start without sidebar visibility persistence; if implementation uncovers a concrete usability regression, limit any follow-up persistence to minimal local storage instead of expanding into a broader preferences system.

## Migration Plan

- No data migration is required because the change only introduces a new client-side default visibility state.
- Roll back by restoring the sidebar's default-open initialization and related layout rules if the collapsed default proves too disruptive after approval.

## Open Questions

- None for proposal approval. Sidebar visibility persistence across reloads stays out of scope unless implementation finds a concrete regression that requires minimal local storage.
