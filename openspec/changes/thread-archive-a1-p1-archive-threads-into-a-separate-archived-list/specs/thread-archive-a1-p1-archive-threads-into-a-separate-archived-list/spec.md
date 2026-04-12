## ADDED Requirements

### Requirement: Archive threads into a separate archived list
The system SHALL implement the approved proposal recorded in OpenSpec change `thread-archive-a1-p1-archive-threads-into-a-separate-archived-list`
and keep the work aligned with this proposal's objective: Persist thread archive state, add archive-aware thread summary/status APIs and an archive mutation, then update the workspace so archived threads are hidden from Living Threads and only visible through a revealed archived list beside Settings, with tests and docs updated for the new behavior.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Archive threads into a separate archived list" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `feat(threads/archive): Archive threads into a separate archived list` and conventional-title metadata `feat(threads/archive)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `feat(threads/archive): Archive threads into a separate archived list`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `thread-archive-a1-p1-archive-threads-into-a-separate-archived-list`
