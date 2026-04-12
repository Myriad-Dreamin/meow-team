## ADDED Requirements

### Requirement: Centralize CLI command runners
The system SHALL implement the approved proposal recorded in OpenSpec change `cli-tools-a1-p1-centralize-cli-command-runners`
and keep the work aligned with this proposal's objective: Move the duplicated `git`, `gh`, and `openspec` exec wrappers into `lib/cli-tools` with one shared process runner, update the existing team and git modules to consume it, and preserve current behavior through validation and targeted tests.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Centralize CLI command runners" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `refactor: Centralize CLI command runners` and conventional-title metadata `refactor`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `refactor: Centralize CLI command runners`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `cli-tools-a1-p1-centralize-cli-command-runners`
