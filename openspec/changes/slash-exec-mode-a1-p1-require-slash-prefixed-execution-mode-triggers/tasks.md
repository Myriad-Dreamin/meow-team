## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Require slash-prefixed execution mode triggers" and confirm the canonical request/PR title is `fix(execution-mode): Require slash execution triggers`
- [x] 1.2 Confirm the proposal stays scoped to slash-prefixed execution-mode parsing and autocomplete, and that conventional-title metadata `fix(execution-mode)` remains separate from the OpenSpec change name and path

## 2. Execution-Mode Contract

- [ ] 2.1 Update `lib/team/execution-mode.ts` so parsing accepts only `/execution `, `/benchmark `, or `/experiment ` at the beginning of request content after optional leading whitespace
- [ ] 2.2 Preserve normalized request-text stripping and verify downstream `lib/team/coding/plan.ts` behavior remains correct after valid slash-prefixed matches

## 3. Autocomplete And Regression Coverage

- [ ] 3.1 Update execution-mode autocomplete so suggestions appear only for slash-prefixed input at request start and no longer for bare mode-name prefixes
- [ ] 3.2 Refresh `lib/team/execution-mode.test.ts` with positive and negative parser and autocomplete cases for leading whitespace, mid-sentence text, and missing-space failures
- [ ] 3.3 Run the relevant targeted validation for execution-mode parsing and autocomplete changes before review
