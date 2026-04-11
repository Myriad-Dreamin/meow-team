## Why

Create a single implementation proposal that updates the workspace shell navigation and status bar: move `Run Team` to an icon-only `+` beside `Living Threads`, add a `Settings` tab opened from a gear icon in the status bar, relocate desktop alerts controls into that tab, remove redundant editor/status labels, and keep existing thread/status behavior intact. Create one proposal to simplify workspace shell controls and relocate desktop alert settings into a dedicated Settings tab. This proposal is one candidate implementation for the request: Improve side UI: - refactor `Run Team` button as a single `+` icon, and place the button at the right side of `Living Threads` title (same line). - remove `workspace-editor-label`s and `workspace-status-label`s. - Add setting tab like `run team tab`, and move `Desktop alerts on` to setting tab. entry of the setting tab (a setting icon) is in the status bar, at the left side of `workspace-status-inline-metric` title. - fontwaesome icons are preferred.

## What Changes

- Introduce the `side-ui-controls-a1-p1-refine-side-ui-controls` OpenSpec change for proposal "Refine Side UI Controls".
- Create a single implementation proposal that updates the workspace shell navigation and status bar: move `Run Team` to an icon-only `+` beside `Living Threads`, add a `Settings` tab opened from a gear icon in the status bar, relocate desktop alerts controls into that tab, remove redundant editor/status labels, and keep existing thread/status behavior intact.
- Keep the proposal logically scoped so any approved coding-review worker can claim it without replanning.

## Capabilities

### New Capabilities

- `side-ui-controls-a1-p1-refine-side-ui-controls`: Create a single implementation proposal that updates the workspace shell navigation and status bar: move `Run Team` to an icon-only `+` beside `Living Threads`, add a `Settings` tab opened from a gear icon in the status bar, relocate desktop alerts controls into that tab, remove redundant editor/status labels, and keep existing thread/status behavior intact.

### Modified Capabilities

- None.

## Impact

- Affected repository: `meow-team`
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Proposal 1: `Refine Side UI Controls`. Suggested OpenSpec change seed: `side-ui-controls-a1-p1-refine-sidebar-actions-and-settings-tab`. Objective: reshape the workspace shell navigation without changing harness behavior. Convert the current full `Run Team` sidebar tab into an icon-only `+` action beside `Living Threads`; add a first-class `Settings` tab that owns the desktop alerts UI; place the settings entry as a gear icon in the left side of the status bar; remove redundant `workspace-editor-label` and `workspace-status-label` text; and apply the required layout/CSS cleanup so the result stays readable on desktop and mobile. Expected implementation surfaces: `components/team-workspace.tsx`, `components/team-status-bar.tsx`, `app/globals.css`, and `package.json` only if Font Awesome is added. Execution notes: - Extend selected-tab state to include `settings` and keep persistence backward-compatible. - Keep icon buttons accessible with labels/tooltips. - Reuse the existing desktop notification state machine and actions instead of rewriting notification logic. - Treat Font Awesome as preferred, not a reason to expand the change beyond the two requested icons. Approval risks to watch: exact gear placement after label removal and whether dependency addition for Font Awesome is acceptable. Until approval, pooled coder/reviewer lanes should not start.
