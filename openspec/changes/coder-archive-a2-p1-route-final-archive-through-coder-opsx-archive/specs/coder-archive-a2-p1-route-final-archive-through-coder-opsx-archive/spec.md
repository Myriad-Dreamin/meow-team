## ADDED Requirements

### Requirement: Route Final Archive Through Coder `/opsx:archive`
The system SHALL implement the approved proposal recorded in OpenSpec change `coder-archive-a2-p1-route-final-archive-through-coder-opsx-archive`
and keep the work aligned with this proposal's objective: Replace machine-only final approval archiving with a non-interactive coder-run `/opsx:archive <change>` pass that can sync unsynced specs and resolve archive-time `TBD` cleanup before the system pushes the branch and refreshes the GitHub PR.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Route Final Archive Through Coder `/opsx:archive`" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `feat(archive/workflow): Route Final Archive Through Coder `/opsx:archive` and conventional-title metadata `feat(archive/workflow)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `feat(archive/workflow): Route Final Archive Through Coder `/opsx:archive`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `coder-archive-a2-p1-route-final-archive-through-coder-opsx-archive`
