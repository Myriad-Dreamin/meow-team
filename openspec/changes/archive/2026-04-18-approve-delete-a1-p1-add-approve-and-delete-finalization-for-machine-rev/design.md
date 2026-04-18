## Context

This change captures proposal "Add approve-and-delete finalization for
machine-reviewed lanes" as OpenSpec change
`approve-delete-a1-p1-add-approve-and-delete-finalization-for-machine-rev`.
Today the machine-reviewed approval path assumes one finalization outcome:
archive the active `openspec/changes/<change>` directory, then refresh the lane
branch's GitHub PR. Adding delete mode touches the approval contract, thread
action derivation, finalization orchestration, lane persistence, and user-facing
history copy, so the implementation needs one shared design rather than a
UI-only patch.

## Goals / Non-Goals

**Goals:**

- Add explicit `archive` and `delete` finalization modes for machine-reviewed
  human approval while keeping proposal approval behavior unchanged.
- Preserve the current `Approve and Archive` path and reuse the same branch
  push and GitHub PR refresh logic after either finalization mode.
- Make delete-mode retries idempotent when proposal deletion, branch push, or
  PR refresh succeeds only partially.
- Surface archived versus deleted outcomes clearly in thread actions, status
  copy, and timeline/history entries.
- Cover the new UI, API, state, and resume paths with regression tests.

**Non-Goals:**

- Change the configured workflow `planner -> coder -> reviewer`.
- Modify proposal approval, coding, machine review, merge automation, or the
  broader OpenSpec archival policy outside this finalization choice.
- Require thread-command parity in the same change.

## Decisions

- Model final human approval as an explicit finalization mode enum with
  `archive` as the default and `delete` as the new option. This is better than
  inferring behavior from one approval endpoint because both UI actions and
  retry logic need the chosen mode recorded end to end.
- Split the current archive-only finalization stage into a shared finalization
  pipeline plus mode-specific proposal-artifact handlers. Sharing commit/push
  and GitHub PR refresh steps avoids two partially duplicated post-review flows
  that could drift on resume behavior.
- Persist finalization intent, proposal artifact disposition, and delivery
  progress explicitly in lane state and history instead of deriving everything
  from `proposalPath`. A deleted proposal cannot be recovered from path
  presence alone, and retry-safe messaging needs to distinguish deleted,
  archived, pushed, and PR-refreshed checkpoints.
- Replace the single machine-reviewed approval helper with an action set that
  can render both finalization buttons and mode-specific pending, success, and
  error copy. Reusing one label-based helper would not represent concurrent
  action availability or completed delete-mode messaging cleanly.
- Keep GitHub PR refresh mandatory after delete mode. The requested workflow is
  "approve and delete proposal artifacts, then finalize delivery," not a
  separate no-PR path.
- Keep the canonical request/PR title as
  `feat: enable approve-and-delete finalization` and the conventional-title
  metadata as `feat`.

## Conventional Title

- Canonical request/PR title: `feat: enable approve-and-delete finalization`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Risks / Trade-offs

- [Delete succeeds before PR refresh fails] -> Persist finalization checkpoints
  so retries resume from PR delivery instead of trying to delete or recommit the
  proposal again.
- [Conflicting artifact state on retry] -> Add guardrails for already archived
  or already deleted proposals and surface clear user-facing failure or
  completed-state copy.
- [UI and API drift on mode handling] -> Centralize mode parsing and action
  derivation, then cover both with regression tests.
- [History ambiguity after final approval] -> Store explicit archived/deleted
  outcomes in lane summaries, planner notes, and timeline events instead of
  generic "approved" messaging.
