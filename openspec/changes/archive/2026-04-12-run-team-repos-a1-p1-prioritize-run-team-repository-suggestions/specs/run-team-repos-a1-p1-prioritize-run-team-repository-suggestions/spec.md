## ADDED Requirements

### Requirement: Prioritize Run Team repository suggestions
The system SHALL implement the approved proposal recorded in OpenSpec change `run-team-repos-a1-p1-prioritize-run-team-repository-suggestions`
and keep the work aligned with this proposal's objective: Implement history-based repository suggestion ranking in the Run Team picker so repositories used in prior team runs are suggested first by most recent use, while the full configured repository list remains selectable.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Prioritize Run Team repository suggestions" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `feat(run/team): Prioritize Run Team repository suggestions` and conventional-title metadata `feat(run/team)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `feat(run/team): Prioritize Run Team repository suggestions`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `run-team-repos-a1-p1-prioritize-run-team-repository-suggestions`
