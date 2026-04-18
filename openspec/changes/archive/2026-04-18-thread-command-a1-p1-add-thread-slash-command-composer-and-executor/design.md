## Context

The current selected-thread experience already has the underlying server
behaviors needed for this feature: proposal approval flows through
`/api/team/approval` into `approveLaneProposal`, final human approval flows
through the same route into `approveLanePullRequest`, and replanning flows
through `/api/team/feedback` into `prepareAssignmentReplan` plus a fresh
planning run. The UI, however, only exposes those actions through per-lane
buttons and feedback forms, and the existing idle-state check
`canRestartPlanning` lives on the client.

This change adds a thread-scoped slash-command surface without changing the
underlying lane state machine. Command semantics need to live on the server so
the client does not duplicate parsing, proposal-number resolution, or
eligibility checks.

## Goals / Non-Goals

**Goals:**

- Add a bottom thread command composer that targets only the latest assignment
  on the currently selected thread.
- Support `/approve [proposal-number]`, `/ready [proposal-number]`,
  `/replan [proposal-number] requirement`, and `/replan-all requirement` with
  deterministic parsing and lane-index resolution.
- Reuse the existing proposal approval, final approval, and replanning helpers
  so the new surface does not introduce parallel orchestration logic.
- Enforce idle-thread gating on both the client and server and return clear
  per-command outcomes for success, skip, and rejection cases.
- Cover the parser, executor, UI pending states, and API docs with regression
  updates.

**Non-Goals:**

- Add free-form chat or natural-language command interpretation.
- Target historical assignments, other threads, or cross-thread batch work.
- Introduce new workflow stages or change the semantics of approval,
  machine-review approval, or replanning.
- Execute multi-proposal approvals concurrently.
- Remove the existing button- and form-based controls as part of this change.

## Decisions

- Add a dedicated thread-scoped command endpoint that accepts raw command text.
  The preferred shape is `POST /api/team/threads/:threadId/command` with a body
  containing the command string. Keeping the route under the thread resource
  makes thread scoping explicit and matches the selected-thread UI.
  Alternative considered: client-side parsing plus calls to the existing
  approval and feedback routes. Rejected because it would duplicate parsing and
  eligibility logic in the browser and weaken server-side guarantees.
- Parse commands on the server into a narrow typed command model. The parser
  should only accept the four supported commands, trim whitespace
  deterministically, require a proposal number for `/replan`, and treat the
  free-form requirement text as the remainder of the command after the keyword
  and optional proposal number.
  Alternative considered: permissive tokenization with best-effort recovery.
  Rejected because owner-facing workflow commands need predictable syntax and
  actionable error messages.
- Extract or share server helpers so the new command route reuses the same
  orchestration entrypoints as `/api/team/approval` and `/api/team/feedback`.
  Proposal approval and final approval should still flow through the current
  `runTeam` machinery, while replanning should still use
  `prepareAssignmentReplan` plus a fresh planning run.
  Alternative considered: having the command route make internal HTTP requests
  to existing endpoints. Rejected because it adds unnecessary network-like
  indirection inside the same Next.js server process and complicates tests.
- Resolve proposal numbers against the latest assignment's `laneIndex` values
  and never against historical assignments. Commands without an explicit
  proposal number should scan only the latest assignment, in ascending
  `laneIndex` order, and target lanes that are currently eligible for the
  requested action.
  Alternative considered: allow assignment numbers or historical proposal
  references in command text. Rejected because the request is explicitly scoped
  to the latest assignment on the current thread.
- Enforce a shared idle-thread gate before execution. The client should disable
  the composer when the thread is archived or the latest assignment still has
  queued, coding, or reviewing work. The server must re-check the same
  conditions so stale clients cannot approve or replan while active work is
  running.
  Alternative considered: rely on client gating only. Rejected because command
  execution must stay correct when the UI is stale or multiple browser tabs are
  open.
- Process batch `/approve` and `/ready` commands sequentially and return a
  structured result summary. Eligible lanes should execute one at a time;
  ineligible lanes should be reported as skipped; and an unexpected execution
  failure should stop the remaining batch while preserving the outcomes already
  recorded for earlier lanes.
  Alternative considered: run batch approvals concurrently. Rejected because it
  would increase race conditions around thread record updates, GitHub PR
  synchronization, and owner-facing result reporting.
- Keep the thread composer additive to the current thread-detail view. The UI
  should render one bottom command textarea with helper text, a submit action,
  a pending state, and the latest command result notice. Existing approval and
  feedback controls can remain in place so the change focuses on the new
  command interaction instead of redesigning the full detail panel.

## Risks / Trade-offs

- [Helper drift across routes] -> Move shared approval and replanning logic into
  reusable server helpers so the command route, approval route, and feedback
  route stay behaviorally aligned.
- [Partial batch progress] -> Return per-lane outcomes and stop only on hard
  execution failures; continue through ordinary skips so the owner can see what
  happened without guessing.
- [Idle-state ambiguity] -> Define idle strictly as "not archived and no queued,
  coding, or reviewing lanes on the latest assignment" and use that rule in
  both the client and server.
- [Command discoverability] -> Show inline helper text and placeholder examples
  in the composer so the supported syntax is visible without external docs.
- [Route placement churn] -> Keep the route thread-scoped in the design, but
  isolate the parser and executor logic in shared modules so path-level changes
  remain local if implementation finds a stronger fit.

## Migration Plan

No persisted data migration is required. Implementation can add the command
endpoint, shared parser and executor helpers, the thread-detail composer, test
coverage, and API docs incrementally while keeping the current approval and
feedback surfaces working. Rollback is straightforward: remove the new route
and composer while leaving the existing approval and feedback endpoints intact.

## Open Questions

- None for the approved proposal scope. If the team later wants to remove the
  existing buttons and feedback forms, that should be handled as follow-up UI
  simplification rather than folded into this command-focused change.
