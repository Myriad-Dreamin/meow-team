## ADDED Requirements

### Requirement: Thread detail exposes a slash-command composer for the latest idle assignment

The selected thread detail view SHALL render a dedicated bottom command
composer that is scoped to the current thread's latest assignment and reserved
for supported slash commands only.

#### Scenario: Idle thread shows the command composer

- **WHEN** a user opens a selected thread whose latest assignment is not
  archived and has no queued, coding, or reviewing lanes
- **THEN** the thread detail SHALL render a bottom textarea or equivalent
  composer plus a submit control for slash commands
- **AND** SHALL show helper copy that lists the supported command forms
  `/approve`, `/ready`, `/replan`, and `/replan-all`

#### Scenario: Busy or archived thread blocks command submission

- **WHEN** the selected thread is archived or its latest assignment still has
  queued, coding, or reviewing work
- **THEN** the thread detail SHALL disable command submission
- **AND** SHALL explain that thread commands only run while the thread is idle

### Requirement: The thread-command parser accepts only the supported command grammar

The server-side thread-command parser SHALL accept only
`/approve [proposal-number]`, `/ready [proposal-number]`,
`/replan [proposal-number] requirement`, and `/replan-all requirement`, and
SHALL resolve proposal numbers against the latest assignment's `laneIndex`
values.

#### Scenario: Proposal-number commands resolve against lane indexes

- **WHEN** a user submits `/approve 2`, `/ready 2`, or `/replan 2 tighten the
scope`
- **THEN** the executor SHALL resolve `2` against the latest assignment lane
  whose `laneIndex` is `2`
- **AND** SHALL reject the command with a clear error if that latest assignment
  does not contain proposal `2`

#### Scenario: Invalid command syntax returns a clear error

- **WHEN** a user submits an unsupported slash command, omits the required
  feedback text for `/replan` or `/replan-all`, or omits the required proposal
  number for `/replan`
- **THEN** the command endpoint SHALL reject the request without changing any
  thread state
- **AND** SHALL return a user-facing message that explains the invalid syntax

### Requirement: Approval commands reuse existing approval flows and batch sequentially

The thread-command executor SHALL reuse the existing proposal approval and
final approval orchestration for `/approve` and `/ready` instead of creating
new approval state transitions.

#### Scenario: Single-target approval reuses current proposal approval behavior

- **WHEN** a user submits `/approve 1` for a latest-assignment lane that is
  awaiting proposal approval
- **THEN** the system SHALL queue that lane through the existing proposal
  approval flow
- **AND** SHALL return a success message that identifies proposal `1`

#### Scenario: Batch approval processes lanes one at a time

- **WHEN** a user submits `/approve` or `/ready` without a proposal number
- **THEN** the executor SHALL inspect only the latest assignment's lanes in
  ascending `laneIndex` order
- **AND** SHALL execute eligible lanes sequentially instead of concurrently
- **AND** SHALL report per-lane success or skip outcomes in the command result

### Requirement: Replan commands reuse the existing feedback-driven replanning flow

The thread-command executor SHALL route `/replan` and `/replan-all` through the
existing human-feedback replanning flow so proposal and request-group replans
keep their current state transitions and planner restart behavior.

#### Scenario: Proposal replan uses lane-scoped feedback

- **WHEN** a user submits `/replan 3 split the implementation into smaller
steps` for an idle thread whose latest assignment contains proposal `3`
- **THEN** the system SHALL record proposal-scoped human feedback for that lane
- **AND** SHALL supersede the current assignment and start a fresh planning run
- **AND** SHALL return an accepted response for the replanning request

#### Scenario: Request-group replan uses assignment-scoped feedback

- **WHEN** a user submits `/replan-all reduce scope to a single proposal`
- **THEN** the system SHALL record assignment-scoped human feedback for the
  latest assignment
- **AND** SHALL start the next planning run through the existing replanning
  path

### Requirement: Command execution enforces idle-thread gating on the server

The thread-command endpoint SHALL re-check that the current thread is not
archived and that its latest assignment is idle before executing any supported
command, even when the client already disabled or enabled the composer.

#### Scenario: Active work blocks command execution

- **WHEN** the command endpoint receives a supported command for a thread whose
  latest assignment still has queued, coding, or reviewing lanes
- **THEN** the endpoint SHALL reject the request without approving, finalizing,
  or replanning any lane
- **AND** SHALL return a clear message that the thread must become idle first

#### Scenario: Historical assignments are never targeted

- **WHEN** a thread detail still shows older assignments in the timeline
- **THEN** thread commands SHALL execute only against the latest assignment
- **AND** SHALL NOT accept syntax that targets older assignments or other
  threads

### Requirement: Command outcomes, docs, and tests stay explicit

The system SHALL surface clear user-facing command outcomes and update the
repository's API docs and regression coverage for the new thread-command
surface.

#### Scenario: Partial skips are reported clearly

- **WHEN** a batch `/approve` or `/ready` command includes a mix of eligible
  and ineligible latest-assignment lanes
- **THEN** the command result SHALL identify which proposals were approved or
  finalized
- **AND** SHALL identify which proposals were skipped and why

#### Scenario: API docs and tests cover the new surface

- **WHEN** this capability is implemented
- **THEN** the repository SHALL include API documentation for the thread-command
  endpoint and any command-specific UI behavior
- **AND** SHALL include regression coverage for parser behavior, idle gating,
  single-target execution, batch sequencing, and UI disabled or pending states

### Requirement: Materialized artifacts preserve request title metadata

The materialized OpenSpec artifacts SHALL preserve the canonical request/PR
title `feat: support thread slash commands` and conventional-title metadata
`feat` without changing the approved change name.

#### Scenario: Proposal set mirrors approved metadata

- **WHEN** planner materializes this change
- **THEN** `proposal.md`, `design.md`, `tasks.md`, and this spec SHALL
  reference the canonical request/PR title `feat: support thread slash commands`
- **AND** SHALL keep `feat` as metadata rather than altering the change path
  `thread-command-a1-p1-add-thread-slash-command-composer-and-executor`
