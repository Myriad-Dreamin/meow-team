## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Add Thread Command Autocomplete" and confirm the canonical request/PR title is `feat: enable thread command autocomplete`
- [x] 1.2 Confirm the scope stays limited to inline thread-command autocomplete, parser and endpoint semantics remain unchanged, and live proposal-number suggestions stay out of scope unless approval expands the change

## 2. Shared Command Metadata

- [x] 2.1 Refactor the supported thread commands into shared metadata that drives helper copy, placeholder guidance, and autocomplete suggestion entries from one source of truth
- [x] 2.2 Add pure autocomplete matching and insertion helpers that detect the active slash-command token and produce valid command drafts without inserting literal placeholder text

## 3. Editor Suggestion UX

- [x] 3.1 Update the local CodeMirror-based thread command editor and composer to show matching suggestions, support arrow-key navigation, accept suggestions with `Tab`, `Enter`, or pointer selection, and dismiss the menu with `Escape`
- [x] 3.2 Preserve the current draft ownership, submit gating, pending button text, disabled-state explanation copy, inline notices, and thread-panel fit while wiring the autocomplete menu into the existing composer styling

## 4. Coverage and Validation

- [x] 4.1 Add node-safe regression coverage for shared thread-command metadata plus autocomplete matching and insertion helpers, and keep the existing parser tests as the grammar authority
- [x] 4.2 Run `pnpm fmt`, `pnpm lint`, targeted Vitest coverage for thread-command metadata or autocomplete helpers and composer regressions, and `pnpm build` if the editor-composer contract changes beyond local UI wiring
