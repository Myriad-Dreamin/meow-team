## 1. Proposal Alignment

- [ ] 1.1 Review the approved OpenSpec artifacts for "Refresh the web harness theme toward Paseo styling" and confirm the canonical request/PR title is `style: align web harness styling with Paseo`
- [ ] 1.2 Confirm the proposal is ready for pooled execution, the reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N` can be claimed, and conventional-title metadata `style` stays separate from `branchPrefix` and change paths

## 2. Shared Theme Tokens

- [ ] 2.1 Update `app/layout.tsx` to load the neutral system sans direction and retoken `app/globals.css` around a `#101615` canvas plus matching panel, border, text, accent, and semantic state values
- [ ] 2.2 Remove the default `Avenir Next` plus serif-heading mix from the shell typography while preserving existing sizing, spacing, and behavior

## 3. Surface Retheme

- [ ] 3.1 Update `components/team-status-bar.module.css`, `components/thread-detail-timeline.module.css`, and `components/agent-task-output-window.module.css` to replace remaining blue-tinted hardcodes with shared Paseo-aligned tokens
- [ ] 3.2 Update `components/codemirror-text-editor.module.css` and `components/client-exception-surface.module.css` so editor and error surfaces follow the new dark palette without changing structure or interaction flows

## 4. Validation

- [ ] 4.1 Run `pnpm fmt`, `pnpm lint`, and focused visual verification for the rethemed shell surfaces before review
- [ ] 4.2 Capture reviewer findings or follow-up fixes for "Refresh the web harness theme toward Paseo styling"
