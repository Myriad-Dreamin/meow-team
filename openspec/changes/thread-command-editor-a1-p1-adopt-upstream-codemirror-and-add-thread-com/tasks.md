## 1. Proposal Alignment

- [ ] 1.1 Review the approved OpenSpec artifacts for "Adopt upstream CodeMirror
      and add thread command autocomplete" and confirm the canonical
      request/PR title is `feat: integrate upstream CodeMirror command autocomplete`
- [ ] 1.2 Confirm conventional-title metadata `feat` stays separate from
      `branchPrefix` and change paths, and keep the implementation scoped to
      the thread command editor dependency swap plus assignment-aware
      autocomplete

## 2. Dependency and Metadata Foundation

- [ ] 2.1 Replace the workspace-linked `codemirror` dependency and remove the
      local shim path from the editor integration, lockfile contract, and
      review guards
- [ ] 2.2 Move supported thread-command metadata into
      `lib/team/thread-command.ts` so parser copy, helper text, placeholder
      text, and autocomplete suggestions use the same source of truth

## 3. Editor and Autocomplete Integration

- [ ] 3.1 Rework `components/thread-command-editor.tsx` around the upstream
      CodeMirror runtime while preserving placeholder guidance, read-only
      handling, ARIA sync, loading or error fallback, and the current
      controlled draft contract
- [ ] 3.2 Add assignment-aware autocomplete for `/approve`, `/ready`,
      `/replan`, and `/replan-all` by wiring command-name and proposal-number
      suggestions from shared metadata plus the latest thread detail state

## 4. Styling, Coverage, and Validation

- [ ] 4.1 Update `app/globals.css` and focused tests for the upstream editor
      DOM, hint dropdown behavior, shared command metadata, and the revised
      dependency contract under the current Vitest constraints
- [ ] 4.2 Run `pnpm fmt`, `pnpm lint`, targeted `pnpm test`, and `pnpm build`
      when the upstream dependency or CSS integration affects the build surface
      before review
