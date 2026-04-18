## 1. Proposal Alignment

- [x] 1.1 Review the approved OpenSpec artifacts for "Add /cancel for approval-waiting threads" and confirm the canonical request/PR title is `feat(threads/approvals): cancel approval-waiting threads`
- [x] 1.2 Confirm `/cancel` stays thread-scoped, targets only the latest idle assignment during proposal or final approval waits, and leaves archive or branch cleanup to the existing inactive-thread archive workflow

## 2. Cancellation Lifecycle Model

- [x] 2.1 Add persisted latest-assignment cancellation metadata plus derived `cancelled` thread and assignment status handling in `lib/team/history.ts`, `lib/team/types.ts`, and related helpers
- [x] 2.2 Update terminal-state, archive-eligibility, and attention or approval-action routing so cancelled latest assignments are terminal, archivable, and no longer treated as approval waits

## 3. Command Execution and Presentation

- [x] 3.1 Extend shared thread-command metadata, parser, placeholder or helper text, autocomplete, and command-editor UX with `/cancel`
- [x] 3.2 Implement the server-side `/cancel` executor so it cancels the latest approval-waiting request group without queueing coder, reviewer, or final-archive work and returns clear success or skip copy
- [x] 3.3 Update status labels, pills, timeline or task-output rendering, and approval controls so cancelled request groups display `Cancelled` consistently across the workspace

## 4. Coverage and Validation

- [x] 4.1 Add focused regression coverage for `/cancel` parser and autocomplete behavior, cancellation eligibility, persisted cancelled status derivation, archive gating, notification suppression, and UI rendering
- [ ] 4.2 Update API or user docs for `/cancel`, then run `pnpm fmt`, `pnpm lint`, targeted tests, and `pnpm build` before review
