## Why

The workspace currently opens with the left navigation sidebar expanded, which keeps thread navigation visible but reduces the editor's initial focus area and adds a stacked sidebar block on narrower screens. This change makes the editor the default first view while preserving immediate access to navigation through an always-visible reveal control.

## What Changes

- Introduce the `sidebar-default-a1-p1-hide-the-left-sidebar-by-default` OpenSpec change for proposal "Hide the left sidebar by default".
- Default the workspace shell sidebar to collapsed on initial load and add a persistent reveal/toggle control in always-visible chrome.
- Update desktop and responsive layout behavior so the editor expands cleanly while the sidebar is hidden and archived/living thread navigation remains usable after reopening.
- Add focused automated coverage for sidebar visibility helpers or toggle-state logic under the existing Vitest setup.
- Keep scope limited to sidebar visibility, reveal-control wiring, layout polish, and related regression coverage.

## Capabilities

### New Capabilities

- `sidebar-default-a1-p1-hide-the-left-sidebar-by-default`: Default the workspace sidebar to collapsed on initial load, provide an always-visible reveal control, preserve thread navigation state when the sidebar is reopened, and cover the new visibility behavior with focused regression tests.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat(workspace/sidebar): collapse left sidebar by default`
- Conventional title metadata: `feat(workspace/sidebar)`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Expected implementation surfaces: `components/team-workspace.tsx`, `components/team-status-bar.tsx`, `app/globals.css`, and focused Vitest coverage around extracted visibility helpers or toggle-state logic
- No API or dependency changes are expected; existing thread selection, archived-thread reveal, repository-group collapse, and status-lane navigation behavior must remain intact
- Planner deliverable: Proposal 1 objective is to implement a default-collapsed workspace sidebar with an always-visible reveal toggle, responsive layout updates, and focused test coverage so thread navigation remains usable without occupying the initial view. Out of scope: reworking thread organization, changing status-lane behavior, or introducing a larger settings/preferences system unless minimal persistence is required to avoid a usability regression.
