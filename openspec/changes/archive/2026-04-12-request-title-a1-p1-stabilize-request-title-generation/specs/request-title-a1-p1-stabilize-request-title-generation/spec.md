## ADDED Requirements

### Requirement: Stabilize request title generation
The system SHALL implement the approved proposal recorded in OpenSpec change `request-title-a1-p1-stabilize-request-title-generation`
and keep the work aligned with this proposal's objective: Generate request titles during initial metadata resolution, preserve them through planning, and normalize conventional-prefixed subjects to lowercased, non-duplicated wording.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Stabilize request title generation" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `fix: Stabilize request title generation` and conventional-title metadata `fix`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `fix: Stabilize request title generation`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `request-title-a1-p1-stabilize-request-title-generation`
