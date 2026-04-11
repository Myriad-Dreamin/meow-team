## ADDED Requirements

### Requirement: Refactor `runTeam` into a persisted stage machine

The system SHALL implement the approved proposal recorded in OpenSpec change `stateful-team-run-a1-p1-refactor-runteam-into-a-persisted-stage-machine`
and keep the work aligned with this proposal's objective: Introduce `{ stage: 'init', args }` state initialization, add `env.persistState` and `env.deps`, inline `ensurePendingDispatchWork` into staged `runTeam` orchestration, and thread metadata-generation, planning, coding, reviewing, and archiving through the same resumable state model.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Refactor `runTeam` into a persisted stage machine" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title `refactor(team/runteam): Refactor `runTeam` into a persisted stage machine` and conventional-title metadata `refactor(team/runteam)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `refactor(team/runteam): Refactor `runTeam` into a persisted stage machine`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `stateful-team-run-a1-p1-refactor-runteam-into-a-persisted-stage-machine`
