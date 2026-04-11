## Context

This change captures proposal "Refine Side UI Controls" as OpenSpec change `side-ui-controls-a1-p1-refine-side-ui-controls`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

## Goals / Non-Goals

**Goals:**
- Create a single implementation proposal that updates the workspace shell navigation and status bar: move `Run Team` to an icon-only `+` beside `Living Threads`, add a `Settings` tab opened from a gear icon in the status bar, relocate desktop alerts controls into that tab, remove redundant editor/status labels, and keep existing thread/status behavior intact.
- Preserve a reviewable OpenSpec contract before coding starts.
- Keep the proposal logical enough that any pooled worker can execute it.
- Reuse a managed worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` for cache-friendly execution.

**Non-Goals:**
- Bind this proposal to a specific branch or worker slot before approval.
- Expand scope beyond the approved proposal without human feedback.
- Merge sibling proposals into a single coding pass without replanning.

## Decisions

- Store the proposal as a dedicated OpenSpec change before coding begins.
- Let the pooled coding-review runtime allocate execution branches and worktrees after approval.
- Use planner output as the starting point for reviewer validation and follow-up tasks.
- Prefer incremental implementation that can be requeued after machine review feedback.

## Risks / Trade-offs

- [Proposal drift] -> Compare implementation against the approved OpenSpec artifacts before coding.
- [Sibling proposal overlap] -> Send cross-proposal changes back to request-group replanning.
- [Reusable worktree residue] -> Reset the managed worktree before each proposal run.
- [Validation gaps] -> Require reviewer findings and task completion before treating work as complete.

Planner deliverable reference: Proposal 1: `Refine Side UI Controls`. Suggested OpenSpec change seed: `side-ui-controls-a1-p1-refine-sidebar-actions-and-settings-tab`. Objective: reshape the workspace shell navigation without changing harness behavior. Convert the current full `Run Team` sidebar tab into an icon-only `+` action beside `Living Threads`; add a first-class `Settings` tab that owns the desktop alerts UI; place the settings entry as a gear icon in the left side of the status bar; remove redundant `workspace-editor-label` and `workspace-status-label` text; and apply the required layout/CSS cleanup so the result stays readable on desktop and mobile. Expected implementation surfaces: `components/team-workspace.tsx`, `components/team-status-bar.tsx`, `app/globals.css`, and `package.json` only if Font Awesome is added. Execution notes: - Extend selected-tab state to include `settings` and keep persistence backward-compatible. - Keep icon buttons accessible with labels/tooltips. - Reuse the existing desktop notification state machine and actions instead of rewriting notification logic. - Treat Font Awesome as preferred, not a reason to expand the change beyond the two requested icons. Approval risks to watch: exact gear placement after label removal and whether dependency addition for Font Awesome is acceptable. Until approval, pooled coder/reviewer lanes should not start.
