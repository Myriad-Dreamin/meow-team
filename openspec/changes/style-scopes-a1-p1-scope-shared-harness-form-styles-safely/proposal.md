## Why

The harness currently ships generic shared form selectors such as `.field` from
`app/globals.css`, which lets unrelated external component styles collide with
the app's own form surfaces. Renaming those selectors to an app-owned namespace
fixes the collision without changing the existing console and thread form
behavior.

## What Changes

- Introduce the
  `style-scopes-a1-p1-scope-shared-harness-form-styles-safely` OpenSpec change
  for proposal "Scope shared harness form styles safely".
- Rename the harness-owned shared form selectors in `app/globals.css` from
  generic names such as `field`, `field-row`, and `field-hint` to an
  app-specific namespace that is safe to keep global.
- Update every affected harness component usage, including
  `components/team-console.tsx`,
  `components/thread-command-composer.tsx`,
  `components/thread-status-board.tsx`, and
  `components/thread-detail-timeline.tsx`, so the renamed selectors continue to
  style the same UI surfaces.
- Keep the current form layout, hint text, focus treatment, and textarea
  interaction behavior intact while isolating the shared styles from external
  `.field` collisions.
- Materialize this as one implementation proposal so coding and review can
  execute the rename, call-site updates, and regression checks together.

## Capabilities

### New Capabilities

- `style-scopes-a1-p1-scope-shared-harness-form-styles-safely`: Scope the
  harness shared form primitives behind app-owned class names, update all
  affected component call sites, and preserve the current shared form layout
  and interaction behavior while eliminating unsafe `.field` selector
  collisions.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `fix: scope shared form styles safely`
- Conventional title metadata: `fix`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected code: `app/globals.css`,
  `components/team-console.tsx`,
  `components/thread-command-composer.tsx`,
  `components/thread-status-board.tsx`, and
  `components/thread-detail-timeline.tsx`
- Related styling context: `editors/vscode/media/styles.css` already defines a
  separate `.field` selector, so the harness rename must avoid introducing
  another ambiguous generic class name
- Coding-review execution: pooled workers with reusable worktrees from
  `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: preferred single proposal because the stylesheet rename,
  component call-site updates, and visual-regression checks only make sense as
  one safe implementation slice
