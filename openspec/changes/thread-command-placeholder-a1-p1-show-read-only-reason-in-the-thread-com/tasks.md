## 1. Proposal Alignment

- [ ] 1.1 Review the approved OpenSpec artifacts for "Show read-only reason in the thread command placeholder" and confirm the canonical request/PR title is `fix: show disabled reason in command placeholder`
- [ ] 1.2 Confirm the approved scope only changes placeholder copy for eligibility-driven read-only states and keeps pending-only disablement on the existing `Enter slash commands...` placeholder unless follow-up approval expands it

## 2. Placeholder Behavior

- [ ] 2.1 Update `components/thread-command-composer.tsx` so the editor placeholder uses `disabledReason` when present and otherwise falls back to `Enter slash commands...`
- [ ] 2.2 Touch `components/thread-command-editor.tsx` only if focused verification shows the runtime placeholder no longer tracks the updated prop correctly

## 3. Regression Coverage and Validation

- [ ] 3.1 Add focused `components/thread-command-composer.test.ts` coverage for the eligibility-disabled placeholder path and the default editable placeholder path without changing command parsing or server-side gating
- [ ] 3.2 Run `pnpm fmt`, `pnpm lint`, and targeted thread-command composer tests; run `pnpm build` as well if implementation changes extend beyond the scoped UI placeholder path
