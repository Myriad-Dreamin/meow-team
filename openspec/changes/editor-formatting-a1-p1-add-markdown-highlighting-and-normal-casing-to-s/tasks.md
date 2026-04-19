## 1. Shared editor runtime

- [ ] 1.1 Update `components/codemirror-text-editor.tsx` to load the required
  CodeMirror markdown mode without disturbing the current addon import order.
- [ ] 1.2 Confirm the shared editor configuration still preserves request
  prefix and slash-command autocomplete behavior after markdown mode is wired.

## 2. Editor presentation

- [ ] 2.1 Add shared CSS rules in `app/globals.css` for
  `.team-request-editor` and `.thread-command-editor` that enable markdown
  token styling and explicitly restore normal text casing in editable content.
- [ ] 2.2 Verify `components/team-request-editor.tsx` and
  `components/thread-command-editor.tsx` keep the change scoped to the
  approved request-entry surfaces, including any needed capitalization-related
  input attributes.

## 3. Regression coverage

- [ ] 3.1 Extend focused tests around the shared editor dependency/runtime so
  markdown mode packaging regressions are caught.
- [ ] 3.2 Update adjacent editor tests such as
  `components/thread-command-editor.review.test.ts` and
  `components/team-console.test.ts` to cover markdown-aware rendering guards
  and normal-casing behavior on both editor surfaces.
