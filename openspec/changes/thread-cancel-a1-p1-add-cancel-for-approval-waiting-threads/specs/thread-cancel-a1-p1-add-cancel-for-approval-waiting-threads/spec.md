## ADDED Requirements

### Requirement: Thread command metadata includes `/cancel`

The shared thread-command metadata SHALL add `/cancel` as a supported
thread-scoped command and SHALL keep parser support, helper copy, placeholder
guidance, and autocomplete aligned from that shared definition.

#### Scenario: Command editor advertises `/cancel`

- **WHEN** the owner focuses the thread command editor for an idle latest
  assignment
- **THEN** the helper text and placeholder guidance SHALL list `/cancel`
  alongside the existing supported thread commands
- **AND** slash-command autocomplete SHALL suggest `/cancel` with parser-aligned
  syntax copy

#### Scenario: Unsupported `/cancel` syntax is rejected clearly

- **WHEN** the owner submits `/cancel` with unsupported extra arguments or an
  unknown slash command
- **THEN** the parser SHALL reject the request without mutating thread state
- **AND** the returned error SHALL explain the supported thread-command syntax

### Requirement: `/cancel` cancels only the latest idle approval-waiting assignment

The thread-command endpoint SHALL execute `/cancel` only against the latest
idle assignment on the current thread when that request group is waiting for
proposal approval or final human approval.

#### Scenario: Proposal approval wait is cancelled

- **WHEN** the latest assignment is idle and at least one latest-assignment
  lane is waiting for proposal approval
- **AND** the owner submits `/cancel`
- **THEN** the system SHALL cancel the latest request group without queueing
  coder, reviewer, or final-archive work
- **AND** the command result SHALL report the request-group cancellation as a
  success

#### Scenario: Final approval wait is cancelled

- **WHEN** the latest assignment is idle and at least one latest-assignment
  lane has finished machine review but is still waiting for final human
  approval
- **AND** the owner submits `/cancel`
- **THEN** the system SHALL cancel the latest request group instead of retrying
  archive or pull-request finalization
- **AND** the existing branch, pull request, and OpenSpec change state SHALL
  remain untouched until a separate explicit archive or follow-up workflow

#### Scenario: Active or ineligible assignments reject cancellation

- **WHEN** the thread is archived, has no latest assignment, is being
  replanned, has queued, coding, or reviewing work, or the latest assignment
  is not waiting for proposal or final human approval
- **THEN** `/cancel` SHALL NOT mutate thread history
- **AND** the command response SHALL explain why cancellation is unavailable

### Requirement: Cancelled lifecycle state persists through history and archive gating

The system SHALL persist explicit cancellation metadata for the latest request
group so refreshed history derives a terminal `cancelled` assignment and thread
status instead of falling back to approval-waiting or machine-reviewed state.

#### Scenario: Refreshed summaries stay cancelled

- **WHEN** a cancelled thread is reloaded from storage or summarized for the
  workspace APIs
- **THEN** the latest assignment status SHALL remain `cancelled`
- **AND** the thread summary status SHALL remain `cancelled`
- **AND** approval actions and attention helpers SHALL stop treating that
  latest assignment as an approval wait

#### Scenario: Cancelled thread becomes archivable without auto-archive

- **WHEN** the latest assignment is cancelled
- **THEN** the existing inactive-thread archive workflow SHALL treat the thread
  as archivable
- **AND** `/cancel` SHALL NOT auto-archive the thread or clean up branches
  outside the existing archive flow

### Requirement: Cancelled status renders consistently across thread and assignment views

The workspace SHALL render `Cancelled` anywhere thread or assignment status is
shown for the latest cancelled request group and SHALL suppress approval or
archive controls for that cancelled state.

#### Scenario: Thread views show `Cancelled`

- **WHEN** the workspace sidebar, selected-thread timeline, or task-output
  result card renders a thread whose latest assignment is cancelled
- **THEN** the visible status label and style SHALL read `Cancelled`
- **AND** the same surfaces SHALL not continue showing `Awaiting Approval` or
  `Machine Reviewed` for that cancelled latest request group

#### Scenario: Docs and tests pin the cancelled behavior

- **WHEN** this capability is implemented
- **THEN** the repository docs SHALL describe `/cancel`, its approval-wait
  eligibility rules, and its non-auto-archive behavior
- **AND** regression coverage SHALL fail if command metadata, persisted
  cancelled status derivation, archive eligibility, or cancelled UI labels
  drift

### Requirement: Conventional title metadata stays explicit

The materialized OpenSpec artifacts SHALL preserve the canonical request or PR
title `feat(threads/approvals): cancel approval-waiting threads` and
conventional-title metadata `feat(threads/approvals)` without changing the
approved change name.

#### Scenario: Materialized artifacts mirror approved title metadata

- **WHEN** planner materializes this change
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the
  canonical request or PR title
  `feat(threads/approvals): cancel approval-waiting threads`
- **AND** conventional-title scope SHALL remain metadata instead of changing
  the proposal change path
  `thread-cancel-a1-p1-add-cancel-for-approval-waiting-threads`
