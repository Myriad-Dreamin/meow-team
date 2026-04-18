## Why

The selected thread view currently exposes proposal approval, final approval,
and replanning through separate per-lane buttons and feedback forms, which
makes the latest assignment harder to drive from one consistent thread-level
surface. A bottom slash-command composer lets the owner act on the current
thread while it is idle, keeps the interaction explicit, and reuses the
existing approval and feedback orchestration instead of introducing a parallel
workflow.

## What Changes

- Introduce the
  `thread-command-a1-p1-add-thread-slash-command-composer-and-executor`
  OpenSpec change for proposal "Add thread slash-command composer and
  executor".
- Add a bottom thread command composer to the selected thread detail view that
  accepts only supported slash commands, targets the latest assignment on the
  current thread, and stays gated to idle-thread states.
- Add a dedicated server-side thread-command parser and executor route that
  resolves proposal numbers against the latest assignment and routes `/approve`,
  `/ready`, `/replan`, and `/replan-all` through the existing proposal
  approval, final approval, and replanning helpers.
- Execute batch `/approve` and `/ready` requests sequentially, report accepted
  work, skips, invalid syntax, and unknown proposal numbers clearly, and keep
  command handling scoped to the current thread only.
- Update regression coverage and API docs for the new command endpoint and the
  thread-detail command composer behavior.
- Keep free-form chat, new workflow stages, and cross-thread or
  cross-assignment commands out of scope.

## Capabilities

### New Capabilities

- `thread-command-a1-p1-add-thread-slash-command-composer-and-executor`: Add a
  bottom thread slash-command composer plus a dedicated parser/executor flow
  that reuses existing approval and replanning helpers, enforces idle-thread
  gating, handles sequential batch approvals, and documents and tests the new
  interaction.

### Modified Capabilities

- None.

## Conventional Title

- Canonical request/PR title: `feat: support thread slash commands`
- Conventional title metadata: `feat`
- Slash-delimited roadmap/topic scope stays in conventional-title metadata and
  does not alter `branchPrefix` or OpenSpec change paths.

## Impact

- Affected repository: `meow-team`
- Affected areas: `components/thread-detail-*`, `components/thread-view-utils.ts`,
  a new thread-command API route under `app/api/team/threads/[threadId]/*` or
  equivalent thread orchestration surface, shared approval and feedback helpers
  in `lib/team/coding`, related tests, and `docs/api/team/*`
- Affected systems: selected-thread UI, human proposal approval, final human
  approval, replanning orchestration, and API documentation
- Planner deliverable: Preferred path: 1 proposal. Add a bottom thread
  slash-command composer and a thread-command execution path that reuses
  existing approve, final-approve, and replan flows while enforcing idle-state
  gating, latest-assignment scoping, sequential batch handling, clear command
  outcomes, and coverage for parser, UI, and API behavior.
