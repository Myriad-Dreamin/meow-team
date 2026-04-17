## Why

The TeamWorkspace sidebar currently resets to the collapsed default on every
refresh, even after the owner explicitly opens it, while other workspace UI
preferences already persist in browser storage. Persisting this open or closed
state removes repeated toggle work after reloads without expanding the feature
beyond the web workspace.

## What Changes

- Introduce the
  `sidebar-visibility-a1-p1-persist-team-workspace-sidebar-visibility-acros`
  OpenSpec change for proposal "Persist team workspace sidebar visibility across
  refreshes".
- Add browser `localStorage` helpers for sidebar visibility that safely read the
  stored value, ignore invalid payloads, and fall back to the existing
  collapsed default when no valid preference exists.
- Restore the stored sidebar visibility during `TeamWorkspace` initialization
  and persist visibility updates when the current status-bar toggle opens or
  closes the sidebar.
- Preserve the existing sidebar toggle UX, accessibility text, and navigation
  behavior while keeping the change scoped to the Next.js web workspace.
- Add focused Vitest coverage for valid, missing, and invalid stored states plus
  persistence behavior.

## Capabilities

### New Capabilities

- `sidebar-visibility-a1-p1-persist-team-workspace-sidebar-visibility-acros`:
  Persist the TeamWorkspace sidebar open or closed state in browser storage,
  restore it on load with a safe collapsed fallback, preserve the current
  toggle UX, and cover storage parsing plus persistence behavior with focused
  unit tests.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat: persist workspace sidebar visibility`
- Conventional title metadata: `feat`
- Conventional-title metadata stays explicit and does not alter `branchPrefix`
  or the OpenSpec change path
  `sidebar-visibility-a1-p1-persist-team-workspace-sidebar-visibility-acros`.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Expected implementation surfaces: `components/team-workspace.tsx`,
  `components/team-workspace-sidebar-visibility.ts`, and focused Vitest coverage
  for sidebar visibility storage helpers
- No API, dependency, or cross-device sync changes are expected; browser-local
  persistence for the web workspace is the full scope
- Planner deliverable: Proposal 1 is the preferred and sufficient path. Store
  the sidebar visibility flag in browser `localStorage`, restore it on load with
  a safe fallback to the existing collapsed default, persist it on toggle, and
  add unit coverage for valid, missing, and invalid stored states while keeping
  repository-group persistence, non-web surfaces, and broader preference sync
  out of scope.
