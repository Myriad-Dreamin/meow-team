# worktree-env-a1-p1-move-worktree-into-teamrunenv Specification

## Purpose

Define the TeamRunEnv-managed worktree context capability for the harness,
including shared worktree construction across planning, lane execution, and
role dispatch so coding flows stop threading raw worktree path strings.

## Requirements

### Requirement: Move worktree into TeamRunEnv

The system SHALL implement the approved proposal recorded in OpenSpec change `worktree-env-a1-p1-move-worktree-into-teamrunenv`
and keep the work aligned with this proposal's objective: Extract worktree-specific logic from `lib/team/coding/dispatch.ts` into dedicated `lib/team/coding/*` helpers, introduce a narrow shared `Worktree` abstraction, and rewire planner/request-title/coder/reviewer execution so `TeamRunEnv` constructs and passes that worktree context instead of raw `worktreePath` strings while preserving existing dispatch behavior and regression coverage.

#### Scenario: Approved proposal enters execution

- **WHEN** a human approves the "Move worktree into TeamRunEnv" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated

The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace

- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit

The system SHALL carry the canonical request/PR title `refactor(team/coding): Move worktree into TeamRunEnv` and conventional-title metadata `refactor(team/coding)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope

- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `refactor(team/coding): Move worktree into TeamRunEnv`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `worktree-env-a1-p1-move-worktree-into-teamrunenv`
