## 1. Proposal Alignment

- [ ] 1.1 Review the approved OpenSpec artifacts for "Replace the team request
      textarea with a CodeMirror request editor" and confirm the canonical
      request/PR title is `feat: replace team request editor`
- [ ] 1.2 Confirm conventional-title metadata `feat` stays separate from
      `branchPrefix` and change paths, and keep the implementation scoped to
      the Continuous Assignment Console request editor plus execution-mode
      prefix alignment

## 2. Shared Execution-Mode Contract

- [ ] 2.1 Refactor `lib/team/execution-mode.ts` so parser matching,
      normalized prefixes, and request-editor autocomplete share the canonical
      colon-prefixed `execution:`, `benchmark:`, and `experiment:` metadata
- [ ] 2.2 Update `lib/team/execution-mode.test.ts` and any related coverage so
      the existing failing `pnpm vitest lib/team/execution-mode.test.ts --run`
      case passes against the shared prefix contract

## 3. Request Editor Integration

- [ ] 3.1 Extract or introduce a reusable CodeMirror wrapper from
      `components/thread-command-editor.tsx` that preserves client-only
      initialization, ARIA sync, loading or error fallback, hint rendering,
      and controlled-value updates
- [ ] 3.2 Replace the `Request` textarea in `components/team-console.tsx` with
      the CodeMirror request editor while preserving the current `prompt`
      state, form submission contract, branch deletion rerun flow, and
      disabled or busy gating
- [ ] 3.3 Add execution-mode prefix autocomplete to the request editor by
      wiring shared metadata from `lib/team/execution-mode.ts` into the editor
      suggestion surface

## 4. Styling, Coverage, and Validation

- [ ] 4.1 Update `app/globals.css` and focused request-editor tests for the
      CodeMirror request surface, placeholder or helper copy, disabled state,
      and execution-mode autocomplete behavior
- [ ] 4.2 Run `pnpm vitest lib/team/execution-mode.test.ts --run`, the new
      focused request-editor regression tests, `pnpm fmt`, `pnpm lint`, and
      `pnpm build` when the shared editor extraction affects the structural UI
      surface
