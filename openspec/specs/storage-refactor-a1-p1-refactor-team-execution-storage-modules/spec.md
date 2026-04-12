# storage-refactor-a1-p1-refactor-team-execution-storage-modules Specification

## Purpose

Define the team execution storage capability for the harness, including shared
SQLite setup under `lib/storage`, thread-specific persistence APIs, runtime
imports that use the split storage modules, and SQLite-backed execution tests
that preserve legacy JSON import coverage.

## Requirements

### Requirement: Refactor team execution storage modules

The system SHALL implement the approved proposal recorded in OpenSpec change `storage-refactor-a1-p1-refactor-team-execution-storage-modules`
and keep the work aligned with this proposal's objective: Create the OpenSpec-backed change `refactor-team-execution-storage` to move `lib/team/storage.ts` into `lib/storage/`, split generic SQLite setup from thread-specific persistence APIs, update affected runtime imports, and convert team execution tests to SQLite-backed fixtures while preserving explicit coverage for legacy JSON import behavior.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Refactor team execution storage modules" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title `refactor(team/storage): Refactor team execution storage modules` and conventional-title metadata `refactor(team/storage)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `refactor(team/storage): Refactor team execution storage modules`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `storage-refactor-a1-p1-refactor-team-execution-storage-modules`
