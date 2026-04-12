# queued-codex-exec-a1-p1-add-queued-codex-executor Specification

## Purpose

Define the queued default Codex executor capability for the harness, including
a shared FIFO `TeamStructuredExecutor` capped by
`teamConfig.dispatch.workerCount` while preserving existing injected executor
behavior and other concurrency controls unchanged.

## Requirements

### Requirement: Add queued Codex executor

The system SHALL implement the approved proposal recorded in OpenSpec change `queued-codex-exec-a1-p1-add-queued-codex-executor`
and keep the work aligned with this proposal's objective: Implement a shared queued `TeamStructuredExecutor` for the default Codex executor, cap concurrent executions at `teamConfig.dispatch.workerCount`, keep all other concurrency controls unchanged, and cover the wiring with focused tests.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Add queued Codex executor" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title `feat: Add queued Codex executor` and conventional-title metadata `feat`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `feat: Add queued Codex executor`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `queued-codex-exec-a1-p1-add-queued-codex-executor`
