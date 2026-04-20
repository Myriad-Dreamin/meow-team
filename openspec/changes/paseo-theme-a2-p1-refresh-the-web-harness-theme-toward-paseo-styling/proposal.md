## Why

The current web harness still uses a blue-tinted shell palette and a mixed
`Avenir Next` plus serif-heading typography system that no longer matches the
requested Paseo direction. This proposal pins the exact background and font
targets into the OpenSpec contract now so the coder lane can retheme the
workspace consistently without reinterpreting the design brief.

## What Changes

- Introduce the `paseo-theme-a2-p1-refresh-the-web-harness-theme-toward-paseo-styling` OpenSpec change for proposal "Refresh the web harness theme toward Paseo styling".
- Retheme the default Next.js web harness toward the pinned Paseo-inspired dark look by using `#101615` as the baseline canvas/background token and replacing the current `Avenir Next` plus serif-heading mix with a single neutral system sans stack led by `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Load the font direction in `app/layout.tsx`, retoken `app/globals.css`, and update the main CSS modules that still hardcode the old blue palette, especially `components/team-status-bar.module.css`, `components/thread-detail-timeline.module.css`, `components/agent-task-output-window.module.css`, `components/codemirror-text-editor.module.css`, and `components/client-exception-surface.module.css`.
- Preserve existing layout, copy, flows, and behavior while making the workspace shell, status bar, timeline, task output window, editor, and error states feel visually consistent with the Paseo-inspired theme.
- Keep scope limited to the default dark theme; theme switching and broader UI redesign remain out of scope.

## Capabilities

### New Capabilities

- `paseo-theme-a2-p1-refresh-the-web-harness-theme-toward-paseo-styling`: Retheme the default web harness toward the pinned Paseo-inspired dark style by centralizing `#101615`-based shell tokens, switching the shell to a neutral system sans stack, and removing the remaining old blue palette treatments from the main shared styling surfaces without changing behavior.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `style: align web harness styling with Paseo`
- Conventional title metadata: `style`
- Conventional-title metadata stays explicit and does not alter the OpenSpec change path `paseo-theme-a2-p1-refresh-the-web-harness-theme-toward-paseo-styling`.

## Impact

- Affected repository: `meow-team`
- Affected code: `app/layout.tsx`, `app/globals.css`, `components/team-status-bar.module.css`, `components/thread-detail-timeline.module.css`, `components/agent-task-output-window.module.css`, `components/codemirror-text-editor.module.css`, and `components/client-exception-surface.module.css`
- External dependencies: None expected; the font direction uses a system sans stack instead of adding hosted font dependencies
- Coding-review execution: pooled workers with reusable worktrees from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`
- Planner deliverable: Recommended OpenSpec change: `paseo-theme-a2-p1-refresh-the-web-harness-theme-toward-paseo-styling`. This should ship as one proposal because the shared token reset, font direction, and CSS module cleanup are the same change stream. Implementation scope: pin `#101615` as the baseline canvas token, load the neutral system sans stack from `app/layout.tsx`, retoken `app/globals.css`, and remove old blue-tinted hardcodes from the main styling surfaces while preserving layout and behavior. Important constraints: do not scope theme switching into this request, do not change product behavior, and keep the coder lane aligned to the pinned color and font targets without reinterpretation. Coding/review lanes remain idle until human approval.
