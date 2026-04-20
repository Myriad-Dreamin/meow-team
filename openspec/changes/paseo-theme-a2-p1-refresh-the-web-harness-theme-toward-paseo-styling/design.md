## Context

This change captures proposal "Refresh the web harness theme toward Paseo
styling" as OpenSpec change
`paseo-theme-a2-p1-refresh-the-web-harness-theme-toward-paseo-styling`.
Implementation starts only after human approval and is claimed by the next
available coding-review worker from the shared pool.

The current shell styling is split between global tokens in `app/globals.css`
and several CSS modules that still hardcode blue-tinted backgrounds, borders,
and highlights. Typography is also inconsistent because the shell uses
`Avenir Next` for most copy while several headings rely on a serif fallback.
The proposal already pins the desired direction: a `#101615` base canvas and a
single neutral system sans stack led by
`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.

## Goals / Non-Goals

**Goals:**

- Retheme the default dark web harness around a shared `#101615`-based token set before coding starts.
- Carry the pinned system sans direction through `app/layout.tsx` so the whole shell uses one typography system.
- Update the shared shell surfaces and listed CSS modules so they stop reintroducing the old blue palette.
- Preserve existing layout, copy, interaction flow, and component behavior while changing only the visual treatment.
- Keep the proposal concrete enough that any pooled worker can execute it without revisiting the styling brief.
- Reuse a managed worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` for cache-friendly execution.

**Non-Goals:**

- Add theme switching, light mode, or user-configurable appearance controls.
- Import remote fonts or add new design-system dependencies.
- Redesign page structure, component composition, or interaction behavior to mimic Paseo more broadly.
- Expand beyond the approved styling surfaces without human feedback.

## Decisions

- Use the pinned neutral system sans stack as the single shell font direction and wire it through `app/layout.tsx`.
  Rationale: the request explicitly replaces the current `Avenir Next` plus serif-heading mix, and a system stack avoids new asset loading while keeping the typography direction stable across the app.
  Alternative considered: keep `Avenir Next` for body copy and only swap headings. Rejected because it would preserve the split typography system the request is trying to remove.
- Centralize the dark retheme in `app/globals.css` by redefining the shared canvas, panel, border, text, accent, and semantic state tokens around `#101615`.
  Rationale: the listed CSS modules already consume several shared variables, so retokening the global layer keeps the change coherent and reduces module drift.
  Alternative considered: patch each module in isolation. Rejected because it would leave the shell dependent on the legacy global palette and make the theme inconsistent.
- Audit the named CSS modules for remaining hardcoded blue or mismatched surface treatments and convert them to shared tokens or narrower semantic variants.
  Rationale: `team-status-bar`, `thread-detail-timeline`, `agent-task-output-window`, `codemirror-text-editor`, and `client-exception-surface` still embed old palette values that will not follow the new globals automatically.
  Alternative considered: rewrite the affected components or introduce a new theme abstraction layer. Rejected because the approved scope is a visual retheme, not a structural component refactor.
- Preserve layout and behavior by limiting the implementation to styling and font-loading changes.
  Rationale: the planner objective explicitly keeps product behavior intact, so the coder should not touch routing, state, copy, or component structure unless a style fix strictly requires it.
  Alternative considered: reshape layouts to more closely match Paseo's repository visuals. Rejected as scope expansion.
- Keep the canonical request/PR title metadata explicit inside the OpenSpec artifacts.
  Rationale: the planner handoff requires `style: align web harness styling with Paseo` and `style` to remain visible without changing branch naming or change paths.

## Conventional Title

- Canonical request/PR title: `style: align web harness styling with Paseo`
- Conventional title metadata: `style`
- Conventional-title metadata stays explicit and does not alter the OpenSpec change path `paseo-theme-a2-p1-refresh-the-web-harness-theme-toward-paseo-styling`.

## Risks / Trade-offs

- [Incomplete retoken coverage] -> Audit the shared shell and the named CSS modules for leftover hardcoded blues before closing the change.
- [Cross-platform font variance] -> Keep the stack order explicit and preserve current sizing and spacing so system font differences do not disturb layout.
- [Contrast regressions on semantic states] -> Preserve distinct danger, warning, and approved accents against the darker canvas instead of flattening everything to one neutral tone.
- [Proposal drift] -> Compare implementation against the pinned `#101615` canvas token and system sans stack before review.
- [Reusable worktree residue] -> Reset the managed worktree before execution so cached CSS changes from prior runs do not hide regressions.

## Migration Plan

No data migration is required. After approval, the coder can land the retheme
as a normal implementation change and roll it back by reverting the styling
patch if visual regressions appear.

## Open Questions

- None. The baseline background token and font direction are intentionally pinned in the proposal so the coding lane does not need additional design clarification.

Planner deliverable reference: Create one implementation-ready Paseo retheme
proposal that explicitly fixes the target background color and font direction
before any coder lane starts. Approved implementation shape: load the font
direction in `app/layout.tsx`, retoken `app/globals.css`, and remove remaining
blue-tinted treatments from the main styling surfaces while preserving layout
and behavior. Coding/review lanes remain idle until human approval.
