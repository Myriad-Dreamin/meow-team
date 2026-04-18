## Context

This change materializes proposal "Add /cancel for approval-waiting threads"
under the fixed OpenSpec scaffold
`thread-cancel-a1-p1-add-cancel-for-approval-waiting-threads`. The repository
already has a shared thread-command metadata table in `lib/team/thread-command.ts`
that drives parser rules, helper copy, placeholder guidance, and autocomplete
for `/approve`, `/ready`, `/replan`, and `/replan-all`, plus a server executor
that always targets the latest idle assignment. The selected-thread UI,
task-output window, timeline, notifications, archive button gating, and status
helpers all derive their current thread or assignment status from the latest
assignment's lane state.

That derived model is the main design constraint. A cancellation feature cannot
rely only on `thread.run.status`, because `lib/team/history.ts` will recompute
thread and assignment status from persisted assignment data and drift back to
`awaiting_human_approval` or `approved` on the next refresh. The change also
touches several duplicated terminal-state and attention checks across history,
archive gating, status pills, notifications, and UI helper copy, so the
cancelled lifecycle contract needs one explicit persisted source of truth.

## Goals / Non-Goals

**Goals:**

- Add `/cancel` to the shared thread-command metadata, parser, autocomplete,
  helper copy, and command editor surface.
- Allow `/cancel` only for the latest idle assignment when the request group is
  waiting for proposal approval or final human approval.
- Persist a real cancelled marker on the latest assignment so thread and
  assignment summaries can derive a terminal `cancelled` state after refresh.
- Render `Cancelled` consistently across thread status labels, timeline or
  task-output result cards, sidebar or archive eligibility, and approval or
  attention behavior.
- Keep `/cancel` thread-scoped and avoid starting coder, reviewer, or
  final-archive work.

**Non-Goals:**

- Add per-proposal cancellation syntax or target historical assignments.
- Cancel queued, coding, or reviewing work that is already active.
- Auto-archive a cancelled thread or delete branches, pull requests, worktrees,
  or OpenSpec changes outside the existing archive flow.
- Redesign the broader thread workspace beyond the status and command updates
  needed for this lifecycle change.

## Decisions

- Persist cancellation on the latest assignment, then derive thread and
  assignment `cancelled` status from that marker. Rationale: the current status
  model is assignment-derived, so a persisted assignment-level marker survives
  storage reloads and keeps thread summaries stable. Alternative rejected:
  mutating only `thread.run.status`, which would drift back on the next
  synchronization pass.
- Treat `/cancel` as a request-group action with two eligible approval waits:
  proposal approval (`awaiting_human_approval`) and final approval (`approved`
  lane plus `pullRequest.status === "awaiting_human_approval"` or retryable PR
  failure metadata). Rationale: both are idle human-approval waits on the
  latest assignment, and the owner asked to cancel approval-waiting threads
  rather than only proposal-stage threads. Alternative rejected: proposal-only
  cancellation, which would leave final approval waits without a symmetric stop
  path.
- Extend the shared thread-command definition table instead of hard-coding
  `/cancel` separately in the UI or parser. Rationale: the existing table is
  already the single source for placeholder text, helper text, autocomplete,
  and parse behavior, so adding `/cancel` there prevents copy and parser drift.
- Reuse the existing latest-assignment idle gating on both client and server,
  then add a cancellation-specific eligibility check on top. Rationale: queued,
  coding, or reviewing work must still block thread commands, while `/cancel`
  also needs to reject latest assignments that are already terminal or not
  awaiting human approval.
- Keep proposal lane records as historical evidence, but make assignment-aware
  status helpers prefer the cancelled assignment state anywhere the UI is
  representing the current request group. Rationale: proposal lanes may already
  contain useful review and PR metadata, while the thread-level status surfaces
  still need to say `Cancelled` consistently and suppress approval actions.
- Make cancelled threads terminal and archivable through the existing archive
  workflow, but do not run archive automatically. Rationale: `/cancel` is an
  owner decision to stop the current request group, not a replacement for the
  explicit archive step that releases thread-owned resources and updates the
  historical archive.

## Conventional Title

- Canonical request/PR title:
  `feat(threads/approvals): cancel approval-waiting threads`
- Conventional title metadata: `feat(threads/approvals)`
- Conventional-title scope remains metadata and does not alter `branchPrefix`
  or the OpenSpec change path.

## Risks / Trade-offs

- [Persisted marker misses one status helper] -> Route cancelled rendering,
  terminal checks, and archive eligibility through shared helpers, then cover
  history, UI, and notification regressions with focused tests.
- [Approval notifications continue after cancellation] -> Ensure attention and
  approval-action helpers short-circuit cancelled latest assignments before
  scanning lane approval states.
- [Final-approval cancellation obscures existing PR metadata] -> Preserve lane
  and pull-request records for audit history, but prefer cancelled assignment
  presentation for current thread status and CTA rendering.
- [Command copy or autocomplete drifts from parser support] -> Keep `/cancel`
  inside the shared thread-command definition table and assert the helper text,
  placeholder, and autocomplete suggestions in tests.
- [Follow-up replanning or archive behavior becomes ambiguous] -> Keep `/cancel`
  narrowly defined as "stop the current latest assignment" and leave archive or
  later replanning to their existing explicit user flows.

## Migration Plan

- Extend thread-command metadata and parsing to include `/cancel`, then add the
  server-side cancellation executor and latest-assignment eligibility checks.
- Persist assignment-level cancellation metadata and update thread or assignment
  status derivation plus terminal or archivable allowlists to emit
  `cancelled`.
- Update UI helpers, approval buttons, notifications, docs, and targeted tests
  so cancelled request groups render consistently and stop showing approval
  waits.
- Validate with `pnpm fmt`, `pnpm lint`, targeted tests, and `pnpm build`.
- Roll back by removing the `/cancel` command definition and the cancelled
  status derivation, which restores the previous approval-only idle command
  surface.

## Open Questions

- None for the approved scope. This materialization assumes `/cancel` is valid
  for both proposal approval waits and final approval waits; if product later
  narrows the feature to proposal-stage cancellation only, that should be
  handled by tightening the executor guard and the user-facing copy.
