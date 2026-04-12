## ADDED Requirements

### Requirement: Statically inline role system prompts
The system SHALL implement the approved proposal recorded in OpenSpec change `static-role-prompts-a2-p1-statically-inline-role-system-prompts`
and keep the work aligned with this proposal's objective: Reapply the completed static `prompts/roles` registry refactor onto the current base branch, resolve merge conflicts across prompt loading, docs, and tooling, and rerun validation so runtime filesystem reads stay removed and the change is merge-ready.

#### Scenario: Approved proposal enters execution
- **WHEN** a human approves the "Statically inline role system prompts" proposal
- **THEN** the system SHALL queue the proposal into the pooled coding and machine-review workflow

### Requirement: Proposal execution stays isolated
The system SHALL keep proposal execution isolated to the claimed implementation
branch and reusable worktree until human feedback explicitly requests
request-group replanning.

#### Scenario: Dedicated execution workspace
- **WHEN** the coder starts work on this proposal
- **THEN** the system SHALL provide a dedicated implementation branch and a reusable worktree from `/home/kamiyoru/work/ts/meow-team/.meow-team-worktrees/meow-N`

### Requirement: Conventional title metadata stays explicit
The system SHALL carry the canonical request/PR title `refactor(team/prompts): Statically inline role system prompts` and conventional-title metadata `refactor(team/prompts)`
through the materialized OpenSpec artifacts without encoding slash-delimited roadmap/topic scope into `branchPrefix` or OpenSpec change paths.

#### Scenario: Materialized artifacts mirror the approved scope
- **WHEN** planner materializes this proposal
- **THEN** the generated proposal, design, spec, and tasks SHALL reference the canonical request/PR title `refactor(team/prompts): Statically inline role system prompts`
- **AND** the slash-delimited roadmap/topic scope SHALL remain metadata instead of changing the proposal change path `static-role-prompts-a2-p1-statically-inline-role-system-prompts`
